// js/dataManagement.js - Advanced data management functions
import { db, FirebaseHelpers } from './firebaseConfig.js';
import {
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Generate random password
function generatePassword(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// ===== PROMOTION FUNCTIONS =====
window.showPromotionConfirmation = async function () {
    const fromGrade = document.getElementById('promotionFromGrade').value;
    const type = document.getElementById('promotionType').value;

    if (!fromGrade) {
        FirebaseHelpers.showToast('الرجاء اختيار صف للترقية', 'error');
        return;
    }

    let message = '';
    if (fromGrade === 'ترم_أول') {
        message = 'هل تريد ترقية جميع الطلاب للترم الثاني؟\nسيتم الاحتفاظ ببيانات الدرجات والجداول';
    } else {
        message = `هل تريد ترقية جميع طلاب "${fromGrade}" إلى الصف التالي؟\n⚠️ سيتم حذف الدرجات والجداول والواجبات`;
    }

    if (confirm(message + '\n\nعملية لا يمكن التراجع عنها!')) {
        await promoteStudents(fromGrade, type);
    }
};

async function promoteStudents(grade, promotionType) {
    try {
        // Show loading
        FirebaseHelpers.showToast('جارٍ الترقية...', 'info');

        // Get all classes of this grade
        const classesQuery = query(
            collection(db, 'classes'),
            where('grade', '==', grade)
        );

        const classesSnap = await getDocs(classesQuery);
        if (classesSnap.empty) {
            FirebaseHelpers.showToast('لم يتم العثور على فصول لهذا الصف', 'error');
            return;
        }

        // Get all students in these classes
        const classIds = classesSnap.docs.map(doc => doc.id);
        const studentsSnap = await getDocs(collection(db, 'students'));

        const batch = writeBatch(db);
        let promotedCount = 0;

        // Map old grades to new grades
        const gradeMap = {
            'الأول الإعدادي': 'الثاني الإعدادي',
            'الثاني الإعدادي': 'الثالث الإعدادي',
            'الأول الثانوي': 'الثاني الثانوي',
            'الثاني الثانوي': 'الثالث الثانوي'
        };

        const newGrade = gradeMap[grade] || grade;

        studentsSnap.forEach(studentDoc => {
            const student = studentDoc.data();

            if (classIds.includes(student.classId)) {
                // Update student grade
                batch.update(doc(db, 'students', studentDoc.id), {
                    grade: newGrade,
                    promotedAt: serverTimestamp()
                });

                promotedCount++;

                // Delete old data if annual promotion
                if (promotionType === 'سنوية') {
                    // Delete grades
                    deleteDocuments('grades', 'studentId', studentDoc.id);

                    // Delete assignments completion status
                    deleteDocuments('assignmentSubmissions', 'studentId', studentDoc.id);

                    // Clear attendance records
                    deleteDocuments('attendance', 'studentId', studentDoc.id);
                }
            }
        });

        // Commit batch
        await batch.commit();

        FirebaseHelpers.showToast(`تم ترقية ${promotedCount} طالب بنجاح`, 'success');

        // Note: These functions need to be called from manager.js context
        setTimeout(() => {
            window.location.reload();
        }, 1500);

    } catch (error) {
        console.error('Promotion error:', error);
        FirebaseHelpers.showToast('فشلت عملية الترقية', 'error');
    }
}

// Helper to delete documents
async function deleteDocuments(collectionName, fieldName, fieldValue) {
    try {
        const q = query(collection(db, collectionName), where(fieldName, '==', fieldValue));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);

        snapshot.forEach(docSnapshot => {
            batch.delete(doc(db, collectionName, docSnapshot.id));
        });

        if (snapshot.size > 0) {
            await batch.commit();
        }
    } catch (error) {
        console.error(`Error deleting ${collectionName}:`, error);
    }
}

// ===== EXCEL UPLOAD FUNCTIONS =====
window.handleStudentsExcelUpload = async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('studentsFileName').textContent = `✓ ${file.name}`;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            await importStudents(jsonData);
        } catch (error) {
            console.error('Error reading Excel:', error);
            FirebaseHelpers.showToast('خطأ في قراءة ملف Excel', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
};

window.handleTeachersExcelUpload = async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('teachersFileName').textContent = `✓ ${file.name}`;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            await importTeachers(jsonData);
        } catch (error) {
            console.error('Error reading Excel:', error);
            FirebaseHelpers.showToast('خطأ في قراءة ملف Excel', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
};

async function importStudents(data) {
    try {
        FirebaseHelpers.showToast('جارٍ استيراد البيانات...', 'info');

        let successCount = 0;
        let errorCount = 0;
        const createdAccounts = [];

        for (const row of data) {
            try {
                const email = row['البريد الإلكتروني'] || row['email'];
                const fullName = row['الاسم'] || row['name'];
                const classId = row['رقم الفصل'] || row['classId'];
                const studentCode = row['الرقم الأكاديمي'] || row['studentCode'];

                if (!email || !fullName) {
                    errorCount++;
                    continue;
                }

                // Generate password
                const password = generatePassword();

                // Create student in Firebase Auth (would need Firebase Admin SDK on backend)
                // For now, we'll just add to Firestore with the password

                const studentRef = doc(collection(db, 'students'));
                await setDoc(studentRef, {
                    email,
                    fullName,
                    classId: classId || null,
                    studentCode: studentCode || null,
                    grade: 'الأول الإعدادي',
                    temporaryPassword: password,
                    createdAt: serverTimestamp(),
                    status: 'active'
                });

                // Create user entry (temporary)
                const userRef = doc(db, 'users', studentRef.id);
                await setDoc(userRef, {
                    email,
                    fullName,
                    role: 'student',
                    uid: studentRef.id,
                    createdAt: serverTimestamp()
                }, { merge: true });

                createdAccounts.push({
                    name: fullName,
                    email,
                    password
                });

                successCount++;
            } catch (error) {
                console.error('Error importing row:', error);
                errorCount++;
            }
        }

        FirebaseHelpers.showToast(`تم استيراد ${successCount} طالب بنجاح`, 'success');

        // Offer to download credentials
        if (createdAccounts.length > 0) {
            setTimeout(() => {
                if (confirm('هل تريد تحميل بيانات الدخول للطلاب الجدد؟')) {
                    downloadStudentCredentials(createdAccounts);
                }
            }, 500);
        }

    } catch (error) {
        console.error('Import error:', error);
        FirebaseHelpers.showToast('فشل استيراد البيانات', 'error');
    }
}

async function importTeachers(data) {
    try {
        FirebaseHelpers.showToast('جارٍ استيراد بيانات المعلمين...', 'info');

        let successCount = 0;
        const createdAccounts = [];

        for (const row of data) {
            try {
                const email = row['البريد الإلكتروني'] || row['email'];
                const fullName = row['الاسم'] || row['name'];
                const subject = row['المادة'] || row['subject'];

                if (!email || !fullName) continue;

                // Generate password
                const password = generatePassword();

                const teacherRef = doc(collection(db, 'users'));
                await setDoc(teacherRef, {
                    email,
                    fullName,
                    role: 'teacher',
                    subject: subject || 'عام',
                    temporaryPassword: password,
                    classes: [],
                    createdAt: serverTimestamp(),
                    uid: teacherRef.id
                });

                createdAccounts.push({
                    name: fullName,
                    email,
                    password,
                    subject
                });

                successCount++;
            } catch (error) {
                console.error('Error importing teacher:', error);
            }
        }

        FirebaseHelpers.showToast(`تم استيراد ${successCount} معلم بنجاح`, 'success');

        if (createdAccounts.length > 0) {
            setTimeout(() => {
                if (confirm('هل تريد تحميل بيانات دخول المعلمين؟')) {
                    downloadTeacherCredentials(createdAccounts);
                }
            }, 500);
        }

    } catch (error) {
        console.error('Teacher import error:', error);
        FirebaseHelpers.showToast('فشل استيراد بيانات المعلمين', 'error');
    }
}

// ===== EXCEL EXPORT FUNCTIONS =====
window.exportStudentsData = async function () {
    try {
        FirebaseHelpers.showToast('جارٍ تصدير البيانات...', 'info');

        const snapshot = await getDocs(collection(db, 'students'));
        const data = [];

        snapshot.forEach(doc => {
            const student = doc.data();
            data.push({
                'الرقم الأكاديمي': student.studentCode || '-',
                'الاسم': student.fullName,
                'البريد الإلكتروني': student.email,
                'الفصل': student.grade || '-',
                'رقم الفصل': student.classId || '-',
                'الحالة': student.status || 'نشط'
            });
        });

        downloadExcel(data, 'students_data.xlsx');
        FirebaseHelpers.showToast('تم التصدير بنجاح', 'success');

    } catch (error) {
        console.error('Export error:', error);
        FirebaseHelpers.showToast('فشل التصدير', 'error');
    }
};

window.exportTeachersData = async function () {
    try {
        FirebaseHelpers.showToast('جارٍ تصدير بيانات المعلمين...', 'info');

        const snapshot = await getDocs(query(
            collection(db, 'users'),
            where('role', '==', 'teacher')
        ));

        const data = [];

        snapshot.forEach(doc => {
            const teacher = doc.data();
            data.push({
                'الاسم': teacher.fullName,
                'البريد الإلكتروني': teacher.email,
                'المادة': teacher.subject || '-',
                'عدد الفصول': (teacher.classes || []).length
            });
        });

        downloadExcel(data, 'teachers_data.xlsx');
        FirebaseHelpers.showToast('تم التصدير بنجاح', 'success');

    } catch (error) {
        console.error('Export error:', error);
        FirebaseHelpers.showToast('فشل التصدير', 'error');
    }
};

function downloadExcel(data, filename) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, filename);
}

function downloadStudentCredentials(students) {
    const data = students.map(s => ({
        'الاسم': s.name,
        'البريد الإلكتروني': s.email,
        'كلمة المرور المؤقتة': s.password,
        'ملاحظة': 'يجب تغيير كلمة المرور عند أول دخول'
    }));

    downloadExcel(data, 'student_credentials.xlsx');
}

function downloadTeacherCredentials(teachers) {
    const data = teachers.map(t => ({
        'الاسم': t.name,
        'البريد الإلكتروني': t.email,
        'المادة': t.subject,
        'كلمة المرور المؤقتة': t.password,
        'ملاحظة': 'يجب تغيير كلمة المرور عند أول دخول'
    }));

    downloadExcel(data, 'teacher_credentials.xlsx');
}

// ===== CLASSES WITH STUDENTS VIEW =====
window.loadClassesWithStudents = async function () {
    try {
        const container = document.getElementById('classesStudentsContainer');
        const classesSnap = await getDocs(collection(db, 'classes'));
        const studentsSnap = await getDocs(collection(db, 'students'));

        // Group students by class
        const studentsByClass = new Map();
        studentsSnap.forEach(doc => {
            const student = doc.data();
            const classId = student.classId;
            if (!studentsByClass.has(classId)) {
                studentsByClass.set(classId, []);
            }
            studentsByClass.get(classId).push({
                id: doc.id,
                ...student
            });
        });

        let html = '';
        classesSnap.forEach(classDoc => {
            const classData = classDoc.data();
            const students = studentsByClass.get(classDoc.id) || [];

            html += `
                <div class="class-card" data-class-name="${classData.name}" style="border: 1px solid #ecf0f1; border-radius: 10px; overflow: hidden; margin-bottom: 10px;">
                    <div style="background: linear-gradient(135deg, #3498db, #2980b9); color: white; padding: 15px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="toggleClassStudents('class_${classDoc.id}')">
                        <div>
                            <h4 style="margin: 0; font-size: 16px;">${classData.name}</h4>
                            <small style="opacity: 0.8;">الصف: ${classData.grade || '-'}</small>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-weight: bold; font-size: 18px;">${students.length}</div>
                            <small>طالب</small>
                        </div>
                    </div>
                    <div id="class_${classDoc.id}" class="student-list-container" style="display: none;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f8f9fa; border-bottom: 2px solid #ecf0f1;">
                                    <th style="padding: 12px; text-align: right;">#</th>
                                    <th style="padding: 12px; text-align: right;">الاسم</th>
                                    <th style="padding: 12px; text-align: right;">البريد</th>
                                    <th style="padding: 12px; text-align: right;">الحالة</th>
                                    <th style="padding: 12px; text-align: center;">إجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${students.map((student, idx) => `
                                    <tr class="student-row" data-name="${student.fullName}" data-email="${student.email}" style="border-bottom: 1px solid #ecf0f1;">
                                        <td style="padding: 10px;">${idx + 1}</td>
                                        <td style="padding: 10px;"><strong>${student.fullName}</strong></td>
                                        <td style="padding: 10px; font-size: 12px;">${student.email}</td>
                                        <td style="padding: 10px;">
                                            <span class="status-badge ${student.status === 'active' || student.status === undefined ? 'status-active' : 'status-inactive'}">
                                                ${student.status === 'active' || student.status === undefined ? 'نشط' : 'غائب'}
                                            </span>
                                        </td>
                                        <td style="padding: 10px; text-align: center;">
                                            <div class="table-actions" style="justify-content: center;">
                                                <button class="icon-btn edit" onclick="editStudent('${student.id}')" title="تعديل">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="icon-btn delete" onclick="confirmDelete('student', '${student.id}', '${student.fullName}')" title="حذف">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                                <button class="icon-btn" onclick="toggleStatus('${student.id}', ${student.status !== 'inactive'})" title="تغيير الحالة">
                                                    <i class="fas fa-${student.status !== 'inactive' ? 'user-slash' : 'user-check'}"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html || '<p style="text-align: center; color: #7f8c8d;">لا توجد فصول</p>';

    } catch (error) {
        console.error('Load classes error:', error);
        document.getElementById('classesStudentsContainer').innerHTML = '<p style="color: #e74c3c;">خطأ في تحميل البيانات</p>';
    }
};

window.filterStudentsView = function () {
    const query = document.getElementById('studentSearchInput').value.toLowerCase();
    const studentRows = document.querySelectorAll('.student-row');
    const classCards = document.querySelectorAll('.class-card');

    studentRows.forEach(row => {
        const name = row.getAttribute('data-name').toLowerCase();
        const email = row.getAttribute('data-email').toLowerCase();
        if (name.includes(query) || email.includes(query)) {
            row.style.display = '';
            // If searching, make sure parent class is visible
            row.closest('.student-list-container').style.display = 'block';
        } else {
            row.style.display = 'none';
        }
    });

    // Hide class cards if no students match
    classCards.forEach(card => {
        const visibleRows = card.querySelectorAll('.student-row:not([style*="display: none"])');
        if (visibleRows.length === 0 && query !== '') {
            card.style.display = 'none';
        } else {
            card.style.display = 'block';
        }
    });
};

window.filterTeachersTable = function () {
    const query = document.getElementById('teacherSearchInput').value.toLowerCase();
    const rows = document.querySelectorAll('#teachersTableContent tbody tr');

    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        if (text.includes(query)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
};

window.toggleClassStudents = function (classId) {
    const element = document.getElementById(classId);
    if (element) {
        element.style.display = element.style.display === 'none' ? 'block' : 'none';
    }
};

// Update Excel handlers to log activity
const originalHandleStudents = window.handleStudentsExcelUpload;
window.handleStudentsExcelUpload = async function (event) {
    await originalHandleStudents(event);
    if (typeof logActivity === 'function') {
        logActivity('استيراد طلاب', 'تم استيراد قائمة طلاب من ملف Excel');
    }
};

const originalHandleTeachers = window.handleTeachersExcelUpload;
window.handleTeachersExcelUpload = async function (event) {
    await originalHandleTeachers(event);
    if (typeof logActivity === 'function') {
        logActivity('استيراد معلمين', 'تم استيراد قائمة معلمين من ملف Excel');
    }
};

export {
    generatePassword
};

// Make all functions available on window for direct access from HTML onclick handlers
// This is required because HTML onclick handlers don't have access to module scope
