// js/teacher.js
console.log('Teacher Dashboard Script v6 Loaded');
import { db, FirebaseHelpers } from './firebaseConfig.js';
import { startAttendanceScanning } from './attendanceManager.js';
import { initScanner, stopScanner } from './attendance-scanner.js';
import { initGenerator } from './generator.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ===== STATE =====
let currentTeacher = null;
let isLoading = false;

// ===== UI NAVIGATION =====
window.showSection = function (sectionId) {
    // Hide all main sections
    const sections = ['statsSection', 'classesSection', 'scannerSection', 'generatorSection'];

    // Also hide schedule container manually if it exists from viewCurrentSchedule
    const scheduleContainer = document.querySelector('.schedule-management');
    if (scheduleContainer && scheduleContainer.parentElement.id !== sectionId) {
        // If the schedule is NOT inside the requested section, we might need to hide it
        // But schedule uses a different mechanism (dynamic replacement).
        // Let's assume viewCurrentSchedule clears the main area or we just hide the known sections.
    }

    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Special case: if switching AWAY from schedule view (which usually replaces content or hides others)
    // We ensure our sections are hidden first.

    // Show requested section
    const target = document.getElementById(sectionId);
    if (target) target.style.display = 'block';

    // Handle specific section logic
    if (sectionId === 'scannerSection') {
        initScanner('reader');
    } else {
        stopScanner();
    }

    if (sectionId === 'generatorSection') {
        initGenerator();
    }
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', init);

async function init() {
    if (isLoading) return;
    isLoading = true;

    // Show default sections
    window.showSection('statsSection');
    document.getElementById('classesSection').style.display = 'block';

    try {
        // Get user from session
        const currentUserStr = sessionStorage.getItem('currentUser');
        if (!currentUserStr) {
            console.log('No user in init');
            isLoading = false;
            return;
        }

        const user = JSON.parse(currentUserStr);
        await loadTeacherData(user.uid);
        updateCurrentDate();

        await Promise.all([
            loadStatistics(),
            loadTeacherClasses()
        ]);

    } catch (error) {
        FirebaseHelpers.logError('Teacher Init', error);
        FirebaseHelpers.showToast('حدث خطأ في تحميل البيانات', 'error');
    } finally {
        isLoading = false;
    }
}

// ===== LOAD TEACHER DATA =====
async function loadTeacherData(uid) {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));

        if (!userDoc.exists()) {
            console.error('User document not found');
            // Don't redirect - dashboardGuard handles this
            return;
        }

        currentTeacher = { id: uid, ...userDoc.data() };

        if (currentTeacher.role !== 'teacher') {
            console.error('User is not a teacher');
            // Don't redirect - dashboardGuard handles this
            return;
        }

        document.getElementById('userName').textContent = currentTeacher.fullName;
        document.getElementById('userEmail').textContent = currentTeacher.email;
        document.getElementById('welcomeName').textContent = currentTeacher.fullName;
        document.getElementById('teacherSubject').textContent = currentTeacher.subject || 'غير محدد';
        document.getElementById('subjectBadge').textContent = currentTeacher.subject || 'المادة';
        document.getElementById('userAvatar').textContent = getInitials(currentTeacher.fullName);

        // Show subject selection prompt if not set
        if (!currentTeacher.subject) {
            setTimeout(() => {
                selectSubject();
            }, 500);
        }

        const classesCount = currentTeacher.classes ? currentTeacher.classes.length : 0;
        // document.getElementById('totalClasses').textContent = classesCount; // Removed as element doesn't exist


    } catch (error) {
        FirebaseHelpers.logError('Load Teacher', error);
        throw error;
    }
}

// ===== LOAD STATISTICS =====
async function loadStatistics() {
    try {
        const classesCount = currentTeacher.classes ? currentTeacher.classes.length : 0;
        animateCounter('classesCount', classesCount);

        // Update Students Count
        let totalStudents = 0;
        if (currentTeacher.classes && currentTeacher.classes.length > 0) {
            for (const classId of currentTeacher.classes) {
                const studentsQuery = query(
                    collection(db, 'students'),
                    where('classId', '==', classId)
                );
                const studentsSnap = await getDocs(studentsQuery);
                totalStudents += studentsSnap.size;
            }
        }
        animateCounter('studentsCount', totalStudents);

        // Update Assignments Count (if element exists, otherwise skip)
        const assignmentsQuery = query(
            collection(db, 'assignments'),
            where('teacherId', '==', currentTeacher.id),
            where('status', '==', 'active')
        );
        const assignmentsSnap = await getDocs(assignmentsQuery);
        // animateCounter('assignmentsCount', assignmentsSnap.size); // Element removed from HTML

        // Update Today's Attendance
        const today = new Date().toISOString().split('T')[0];
        const attendanceQuery = query(
            collection(db, 'attendance'),
            where('markedBy', '==', currentTeacher.id),
            where('date', '==', today)
        );

        const attendanceSnap = await getDocs(attendanceQuery);
        let presentCount = 0;

        attendanceSnap.forEach(doc => {
            const data = doc.data();
            if (data.status === 'present') presentCount++;
        });

        // Update todayAttendance element
        const todayAttendanceEl = document.getElementById('todayAttendance');
        if (todayAttendanceEl) {
            todayAttendanceEl.textContent = presentCount;
        }

        // Placeholder for todaySessionsCount (can be implemented with schedule logic later)
        const todaySessionsEl = document.getElementById('todaySessionsCount');
        if (todaySessionsEl) {
            todaySessionsEl.textContent = '0'; // Default for now
        }

    } catch (error) {
        FirebaseHelpers.logError('Load Statistics', error);
    }
}

// ===== LOAD TEACHER CLASSES =====
async function loadTeacherClasses() {
    const container = document.getElementById('classesContainer');

    try {
        if (!currentTeacher.classes || currentTeacher.classes.length === 0) {
            container.innerHTML = createEmptyState(
                'لا توجد فصول مكلف بها',
                'لم يتم تعيين أي فصول لك بعد. يرجى التواصل مع المدير.',
                'fas fa-users-class'
            );
            return;
        }

        const classesData = [];
        for (const classId of currentTeacher.classes) {
            try {
                const classDoc = await getDoc(doc(db, 'classes', classId));
                if (classDoc.exists()) {
                    const studentsQuery = query(
                        collection(db, 'students'),
                        where('classId', '==', classId)
                    );
                    const studentsSnap = await getDocs(studentsQuery);

                    const today = new Date().toISOString().split('T')[0];
                    const attendanceQuery = query(
                        collection(db, 'attendance'),
                        where('classId', '==', classId),
                        where('date', '==', today)
                    );
                    const attendanceSnap = await getDocs(attendanceQuery);

                    let presentCount = 0;
                    attendanceSnap.forEach(doc => {
                        if (doc.data().status === 'present') presentCount++;
                    });

                    const attendanceRate = studentsSnap.size > 0
                        ? Math.round((presentCount / studentsSnap.size) * 100)
                        : 0;

                    classesData.push({
                        id: classId,
                        data: classDoc.data(),
                        studentsCount: studentsSnap.size,
                        attendanceRate: attendanceRate
                    });
                }
            } catch (error) {
                console.error(`Error loading class ${classId}:`, error);
            }
        }

        if (classesData.length === 0) {
            container.innerHTML = createEmptyState(
                'لا توجد فصول متاحة',
                'الفصول المخصصة لك غير موجودة في النظام',
                'fas fa-exclamation-triangle'
            );
            return;
        }

        let html = '<div class="classes-grid">';

        classesData.forEach(classInfo => {
            const classData = classInfo.data;

            html += `
                <div class="class-card">
                    <div class="class-header">
                        <h3>${classData.name || 'فصل بدون اسم'}</h3>
                        <div class="grade">${classData.grade || 'غير محدد'}</div>
                    </div>
                    <div class="class-body">
                        <div class="class-stats">
                            <div class="class-stat-item">
                                <div class="label">الطلاب</div>
                                <div class="value">${classInfo.studentsCount}</div>
                            </div>
                            <div class="class-stat-item">
                                <div class="label">الحضور</div>
                                <div class="value">${classInfo.attendanceRate}%</div>
                            </div>
                            <div class="class-stat-item">
                                <div class="label">السعة</div>
                                <div class="value">${classData.capacity || 0}</div>
                            </div>
                        </div>
                        
                        <div class="class-actions">
                            <button class="class-btn primary" onclick="takeAttendance('${classInfo.id}')">
                                <i class="fas fa-clipboard-check"></i>
                                <span>الحضور</span>
                            </button>
                            <button class="class-btn success" onclick="viewStudents('${classInfo.id}')">
                                <i class="fas fa-users"></i>
                                <span>الطلاب</span>
                            </button>
                            <button class="class-btn info" onclick="createAssignment('${classInfo.id}')">
                                <i class="fas fa-tasks"></i>
                                <span>واجب</span>
                            </button>
                            <button class="class-btn warning" onclick="viewGrades('${classInfo.id}')">
                                <i class="fas fa-chart-line"></i>
                                <span>الدرجات</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Classes', error);
        container.innerHTML = createErrorState('فشل في تحميل الفصول');
    }
}

// ===== HELPER FUNCTIONS =====
function getInitials(name) {
    if (!name) return 'م';
    return name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();
}

function animateCounter(elementId, target) {
    const element = document.getElementById(elementId);
    if (!element) return;

    let current = 0;
    const increment = target / 30;
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 30);
}

function updateCurrentDate() {
    const now = new Date();
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };
    const dateString = now.toLocaleDateString('ar-EG', options);
    document.getElementById('currentDate').textContent = dateString;
}

function createEmptyState(title, message, icon) {
    return `
        <div class="empty-state">
            <i class="${icon}"></i>
            <h3>${title}</h3>
            <p>${message}</p>
        </div>
    `;
}

function createErrorState(message) {
    return `
        <div class="empty-state">
            <i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>
            <h3>حدث خطأ</h3>
            <p>${message}</p>
        </div>
    `;
}

//===== ACTION FUNCTIONS =====

// Modal Helper
window.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
};

function generateUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Teacher selects their subject
// Show subject selection modal
window.showSubjectSelectionModal = async function () {
    try {
        const subjectInput = document.getElementById('subjectInput');
        if (currentTeacher && currentTeacher.subject) {
            subjectInput.value = currentTeacher.subject;
        } else {
            subjectInput.value = '';
        }

        document.getElementById('subjectSelectionModal').style.display = 'block';
    } catch (error) {
        FirebaseHelpers.logError('Show Subject Modal', error);
        FirebaseHelpers.showToast('فشل فتح نموذج المادة', 'error');
    }
};

// Save subject from modal
window.saveSubjectFromModal = async function () {
    try {
        const subject = document.getElementById('subjectInput').value;
        if (!subject) {
            FirebaseHelpers.showToast('يرجى إدخال المادة', 'error');
            return;
        }

        await updateDoc(doc(db, 'users', currentTeacher.id), {
            subject: subject
        });

        currentTeacher.subject = subject;
        document.getElementById('teacherSubject').textContent = subject;
        document.getElementById('subjectBadge').textContent = subject;

        FirebaseHelpers.showToast('تم تحديث المادة بنجاح', 'success');
        closeModal('subjectSelectionModal');
    } catch (error) {
        FirebaseHelpers.logError('Save Subject', error);
        FirebaseHelpers.showToast('فشل تحديث المادة', 'error');
    }
};

// Select subject function - now uses modal
window.selectSubject = async function () {
    showSubjectSelectionModal();
};

function scrollToSection(id) {
    window.showSection(id);
}

// Teacher selects/adds classes
window.selectClasses = async function () {
    try {
        // Load classes for the modal
        const classesSnap = await getDocs(collection(db, 'classes'));

        if (classesSnap.empty) {
            FirebaseHelpers.showToast('لا توجد فصول متاحة. يجب على المدير إضافة فصول أولاً', 'error');
            return;
        }

        const classListContent = document.getElementById('classListContent');

        let html = '<div class="classes-selection-list">';

        const currentClasses = currentTeacher.classes || [];

        classesSnap.forEach((doc, index) => {
            const classData = doc.data();
            const isAssigned = currentClasses.includes(doc.id);

            html += `
                <div class="class-item">
                    <label class="checkbox-label">
                        <input type="checkbox" 
                               class="class-checkbox" 
                               value="${doc.id}" 
                               ${isAssigned ? 'checked' : ''}>
                        <span class="checkmark"></span>
                        <span class="class-name">${classData.name} (${classData.grade})</span>
                    </label>
                </div>
            `;
        });

        html += '</div>';

        classListContent.innerHTML = html;

        // Show the modal
        document.getElementById('classSelectionModal').style.display = 'block';

    } catch (error) {
        console.error('Select Classes Error:', error);
        FirebaseHelpers.logError('Select Classes', error);
        FirebaseHelpers.showToast('فشل تحميل الفصول: ' + error.message, 'error');
    }
};

// Save selected classes
window.saveSelectedClasses = async function () {
    try {
        const checkboxes = document.querySelectorAll('.class-checkbox:checked');
        const selectedClassIds = Array.from(checkboxes).map(cb => cb.value);

        await updateDoc(doc(db, 'users', currentTeacher.id), {
            classes: selectedClassIds
        });

        currentTeacher.classes = selectedClassIds;
        document.getElementById('totalClasses').textContent = selectedClassIds.length;

        FirebaseHelpers.showToast('تم تحديث الفصول بنجاح', 'success');
        closeModal('classSelectionModal');

        await loadStatistics();
        await loadTeacherClasses();

    } catch (error) {
        console.error('Save Selected Classes Error:', error);
        FirebaseHelpers.logError('Save Selected Classes', error);
        FirebaseHelpers.showToast('فشل تحديث الفصول: ' + error.message, 'error');
    }
};

window.viewStudents = async function (classId) {
    try {
        const studentsQuery = query(
            collection(db, 'students'),
            where('classId', '==', classId)
        );
        const studentsSnap = await getDocs(studentsQuery);

        const studentsListContent = document.getElementById('studentsListContent');

        if (studentsSnap.empty) {
            studentsListContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>لا يوجد طلاب</h3>
                    <p>لا يوجد طلاب في هذا الفصل</p>
                    <button class="btn btn-primary" onclick="showAddStudentModal('${classId}')">إضافة طالب</button>
                </div>
            `;
        } else {
            let html = '<div class="students-list">';

            studentsSnap.forEach(doc => {
                const student = doc.data();

                html += `
                    <div class="student-item">
                        <div class="student-info">
                            <strong>${student.fullName}</strong><br>
                            <small>الرقم: ${student.studentCode} | الجلوس: ${student.seatNumber || 'غير محدد'}</small>
                        </div>
                        <div class="student-actions">
                            <button class="student-btn edit" onclick="showEditStudentModal('${doc.id}', '${student.fullName}', '${student.studentCode}', ${student.seatNumber || 1}, '${student.email || ''}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="student-btn delete" onclick="deleteStudent('${doc.id}', '${student.fullName}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            });

            html += `
                <div style="margin-top: 20px; text-align: center;">
                    <button class="btn btn-primary" onclick="showAddStudentModal('${classId}')">إضافة طالب جديد</button>
                </div>
            `;

            html += '</div>';
            studentsListContent.innerHTML = html;
        }

        // Show the modal
        document.getElementById('viewStudentsModal').style.display = 'block';

    } catch (error) {
        FirebaseHelpers.logError('View Students', error);
        FirebaseHelpers.showToast('فشل عرض الطلاب', 'error');
    }
};

// Show add student modal
window.showAddStudentModal = async function (classId) {
    try {
        document.getElementById('studentId').value = '';
        document.getElementById('studentClassId').value = classId;
        document.getElementById('studentFullName').value = '';
        document.getElementById('studentEmail').value = '';
        document.getElementById('studentCode').value = 'ST' + Date.now().toString().slice(-6);
        document.getElementById('studentSeatNumber').value = '1';
        document.getElementById('studentPassword').value = '123456';

        document.getElementById('addEditStudentModal').style.display = 'block';

    } catch (error) {
        FirebaseHelpers.logError('Show Add Student Modal', error);
        FirebaseHelpers.showToast('فشل فتح نموذج الطالب', 'error');
    }
};

// Show edit student modal
window.showEditStudentModal = async function (studentId, fullName, studentCode, seatNumber, email) {
    try {
        document.getElementById('studentId').value = studentId;
        document.getElementById('studentClassId').value = currentTeacher.classes[0]; // Use current class
        document.getElementById('studentFullName').value = fullName;
        document.getElementById('studentEmail').value = email || '';
        document.getElementById('studentCode').value = studentCode;
        document.getElementById('studentSeatNumber').value = seatNumber;
        // Only set default password for new student creation, not for existing students
        if (document.getElementById('studentPassword').value === '') {
            document.getElementById('studentPassword').value = '123456'; // Default password
        }

        document.getElementById('addEditStudentModal').style.display = 'block';

    } catch (error) {
        FirebaseHelpers.logError('Show Edit Student Modal', error);
        FirebaseHelpers.showToast('فشل فتح نموذج تعديل الطالب', 'error');
    }
};

// Save student from modal
window.saveStudentFromModal = async function () {
    try {
        const studentId = document.getElementById('studentId').value;
        const classId = document.getElementById('studentClassId').value;
        const fullName = document.getElementById('studentFullName').value;
        const email = document.getElementById('studentEmail').value;
        const studentCode = document.getElementById('studentCode').value;
        const seatNumber = parseInt(document.getElementById('studentSeatNumber').value) || 1;
        const password = document.getElementById('studentPassword').value || '123456';

        if (!fullName || !email || !studentCode) {
            FirebaseHelpers.showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
            return;
        }

        if (studentId) {
            // Edit existing student
            await updateDoc(doc(db, 'students', studentId), {
                fullName: fullName,
                email: email,
                studentCode: studentCode,
                seatNumber: seatNumber
            });

            // Also update users collection
            await updateDoc(doc(db, 'users', studentId), {
                fullName: fullName
            });

            FirebaseHelpers.showToast('تم تحديث بيانات الطالب', 'success');
        } else {
            // Add new student
            const uid = generateUID();

            // Create in users collection
            await setDoc(doc(db, 'users', uid), {
                email: email,
                password: password,
                fullName: fullName,
                role: 'student',
                isActive: true,
                createdAt: serverTimestamp(),
                lastLogin: null
            });

            // Create in students collection with same UID
            await setDoc(doc(db, 'students', uid), {
                email: email,
                fullName: fullName,
                studentCode: studentCode,
                classId: classId,
                seatNumber: seatNumber,
                createdAt: serverTimestamp()
            });

            FirebaseHelpers.showToast('تم إضافة الطالب بنجاح', 'success');
        }

        closeModal('addEditStudentModal');
        await loadStatistics();
        await loadTeacherClasses();

        // Refresh the students list if the modal is still open
        if (document.getElementById('viewStudentsModal').style.display === 'block') {
            await viewStudents(classId);
        }

    } catch (error) {
        FirebaseHelpers.logError('Save Student', error);
        FirebaseHelpers.showToast('فشل حفظ بيانات الطالب: ' + error.message, 'error');
    }
};

// Delete student
window.deleteStudent = async function (studentId, studentName) {
    if (!confirm(`هل أنت متأكد من حذف الطالب ${studentName}؟`)) {
        return;
    }

    try {
        await deleteDoc(doc(db, 'students', studentId));
        await deleteDoc(doc(db, 'users', studentId));

        FirebaseHelpers.showToast('تم حذف الطالب', 'success');

        // Refresh the students list if the modal is still open
        const classId = document.getElementById('studentClassId').value;
        if (document.getElementById('viewStudentsModal').style.display === 'block') {
            await viewStudents(classId);
        } else {
            await loadStatistics();
            await loadTeacherClasses();
        }

    } catch (error) {
        FirebaseHelpers.logError('Delete Student', error);
        FirebaseHelpers.showToast('فشل حذف الطالب: ' + error.message, 'error');
    }
};

// Old function - now uses modal
async function addStudentToClass(classId) {
    showAddStudentModal(classId);
}

// Old function - now uses modal
async function editStudent(studentId, studentData) {
    showEditStudentModal(studentId, studentData.fullName, studentData.studentCode, studentData.seatNumber || 1, studentData.email || '');
}

window.takeAttendance = async function () {
    try {
        if (!currentTeacher.classes || currentTeacher.classes.length === 0) {
            FirebaseHelpers.showToast('يجب اختيار فصول أولاً', 'error');
            return;
        }

        // Ask user if they want to use QR code scanning or traditional method
        const useQR = confirm('هل ترغب في استخدام ماسح QR لتسجيل الحضور؟\n(اختر "إلغاء" لاستخدام الطريقة التقليدية)');

        if (useQR) {
            // Use QR code scanning for attendance
            const classSelect = document.createElement('select');
            classSelect.innerHTML = '<option value="">اختر الفصل</option>';

            for (let i = 0; i < currentTeacher.classes.length; i++) {
                const classId = currentTeacher.classes[i];
                const classDoc = await getDoc(doc(db, 'classes', classId));
                if (classDoc.exists()) {
                    const classData = classDoc.data();
                    const option = document.createElement('option');
                    option.value = classId;
                    option.textContent = classData.name;
                    classSelect.appendChild(option);
                }
            }

            // Create a temporary modal for class selection
            const tempModal = document.createElement('div');
            tempModal.className = 'modal';
            tempModal.id = 'tempClassSelectionModal';
            tempModal.style.display = 'block';
            tempModal.style.zIndex = '9999';
            tempModal.innerHTML = `
                <div class="modal-content" style="max-width: 500px; margin: 100px auto;">
                    <div class="modal-header">
                        <h3 class="modal-title">اختر الفصل</h3>
                        <button class="close-btn" onclick="closeTempModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="tempClassSelect">اختر الفصل لتسجيل الحضور</label>
                            <select id="tempClassSelect" class="form-control">
                                \${classSelect.innerHTML}
                            </select>
                        </div>
                        <p>سيتم فتح ماسح QR لتسجيل حضور الطلاب</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeTempModal()">إلغاء</button>
                        <button class="btn btn-primary" onclick="startQRAttendanceScanning()">بدء المسح</button>
                    </div>
                </div>
            `;

            document.body.appendChild(tempModal);

            // Add closeTempModal function to window
            window.closeTempModal = function () {
                const modal = document.getElementById('tempClassSelectionModal');
                if (modal) {
                    modal.remove();
                }
            };

            // Add startQRAttendanceScanning function to window
            window.startQRAttendanceScanning = async function () {
                const selectedClassId = document.getElementById('tempClassSelect').value;
                if (!selectedClassId) {
                    FirebaseHelpers.showToast('الرجاء اختيار فصل', 'error');
                    return;
                }

                // Get class name
                const classDoc = await getDoc(doc(db, 'classes', selectedClassId));
                const className = classDoc.exists() ? classDoc.data().name : 'فصل';

                // Close the temporary modal
                closeTempModal();

                // Start QR attendance scanning
                try {
                    await startAttendanceScanning(currentTeacher.id, className);
                    FirebaseHelpers.showToast('تم تسجيل الحضور بنجاح', 'success');

                    // Update statistics
                    await loadStatistics();
                } catch (error) {
                    FirebaseHelpers.showToast('خطأ في تسجيل الحضور: ' + error.message, 'error');
                }
            };
        } else {
            // Load classes into the select dropdown for traditional attendance
            const classSelect = document.getElementById('attendanceClassSelect');
            classSelect.innerHTML = '<option value="">اختر الفصل</option>';

            for (let i = 0; i < currentTeacher.classes.length; i++) {
                const classId = currentTeacher.classes[i];
                const classDoc = await getDoc(doc(db, 'classes', classId));
                if (classDoc.exists()) {
                    const classData = classDoc.data();
                    const option = document.createElement('option');
                    option.value = classId;
                    option.textContent = classData.name;
                    classSelect.appendChild(option);
                }
            }

            // Show the traditional attendance modal
            document.getElementById('attendanceModal').style.display = 'block';
        }

    } catch (error) {
        FirebaseHelpers.logError('Take Attendance', error);
        FirebaseHelpers.showToast('فشل في فتح نموذج الحضور', 'error');
    }
};

// Load students for attendance
window.loadStudentsForAttendance = async function () {
    const classId = document.getElementById('attendanceClassSelect').value;

    if (!classId) {
        document.getElementById('attendanceStudentsContent').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <h3>اختر فصلاً</h3>
                <p>الرجاء اختيار فصل لعرض الطلاب</p>
            </div>
        `;
        return;
    }

    try {
        // Get students in this class
        const studentsQuery = query(
            collection(db, 'students'),
            where('classId', '==', classId)
        );

        const studentsSnap = await getDocs(studentsQuery);

        if (studentsSnap.empty) {
            document.getElementById('attendanceStudentsContent').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-slash"></i>
                    <h3>لا يوجد طلاب</h3>
                    <p>لا يوجد طلاب في هذا الفصل</p>
                </div>
            `;
            return;
        }

        let html = '<div class="attendance-students-list">';

        studentsSnap.forEach((doc, index) => {
            const student = doc.data();

            html += `
                <div class="attendance-student">
                    <div class="student-info">
                        <strong>${student.fullName}</strong><br>
                        <small>الرقم: ${student.studentCode}</small>
                    </div>
                    <div class="attendance-status">
                        <div class="status-option">
                            <input type="radio" name="attendance_${doc.id}" value="present" class="status-radio" id="present_${doc.id}">
                            <label for="present_${doc.id}">حاضر</label>
                        </div>
                        <div class="status-option">
                            <input type="radio" name="attendance_${doc.id}" value="absent" class="status-radio" id="absent_${doc.id}" checked>
                            <label for="absent_${doc.id}">غائب</label>
                        </div>
                        <div class="status-option">
                            <input type="radio" name="attendance_${doc.id}" value="late" class="status-radio" id="late_${doc.id}">
                            <label for="late_${doc.id}">متأخر</label>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';

        document.getElementById('attendanceStudentsContent').innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Students for Attendance', error);
        document.getElementById('attendanceStudentsContent').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطأ</h3>
                <p>فشل تحميل الطلاب</p>
            </div>
        `;
    }
};

// Save attendance from modal
window.saveAttendanceFromModal = async function () {
    const classId = document.getElementById('attendanceClassSelect').value;

    if (!classId) {
        FirebaseHelpers.showToast('يرجى اختيار فصل', 'error');
        return;
    }

    try {
        const today = new Date().toISOString().split('T')[0];

        // Get all student attendance records
        const studentsQuery = query(
            collection(db, 'students'),
            where('classId', '==', classId)
        );

        const studentsSnap = await getDocs(studentsQuery);

        if (studentsSnap.empty) {
            FirebaseHelpers.showToast('لا يوجد طلاب في هذا الفصل', 'error');
            return;
        }

        // Check for existing attendance for today
        const existingAttendanceQuery = query(
            collection(db, 'attendance'),
            where('classId', '==', classId),
            where('date', '==', today)
        );

        const existingSnap = await getDocs(existingAttendanceQuery);

        if (!existingSnap.empty) {
            if (!confirm('يوجد تسجيل حضور موجود لهذا اليوم. هل تريد استبداله؟')) {
                return;
            }

            // Delete existing attendance records
            for (const doc of existingSnap.docs) {
                await deleteDoc(doc.ref);
            }
        }

        // Process attendance for each student
        for (const studentDoc of studentsSnap.docs) {
            const student = studentDoc.data();
            const studentId = studentDoc.id;

            // Get selected attendance status
            const radios = document.querySelectorAll(`input[name="attendance_${studentId}"]:checked`);
            let status = 'absent'; // default

            if (radios.length > 0) {
                status = radios[0].value;
            }

            // Save attendance record
            await addDoc(collection(db, 'attendance'), {
                studentId: studentId,
                studentName: student.fullName,
                classId: classId,
                className: '', // Will be populated with class name
                date: today,
                status: status,
                markedBy: currentTeacher.id,
                markedByName: currentTeacher.fullName,
                timestamp: serverTimestamp()
            });
        }

        // Get class name for confirmation
        const classDoc = await getDoc(doc(db, 'classes', classId));
        const className = classDoc.exists() ? classDoc.data().name : 'غير معروف';

        FirebaseHelpers.showToast(`تم تسجيل الحضور للفصل ${className} (${studentsSnap.size} طالب)`, 'success');
        closeModal('attendanceModal');

        // Update statistics
        await loadStatistics();

    } catch (error) {
        FirebaseHelpers.logError('Save Attendance', error);
        FirebaseHelpers.showToast('فشل في تسجيل الحضور: ' + error.message, 'error');
    }
};

// Record attendance for students in a class
async function recordAttendanceForClass(classId) {
    try {
        // Get students in this class
        const studentsQuery = query(
            collection(db, 'students'),
            where('classId', '==', classId)
        );

        const studentsSnap = await getDocs(studentsQuery);

        if (studentsSnap.empty) {
            FirebaseHelpers.showToast('لا يوجد طلاب في هذا الفصل', 'error');
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        // Get existing attendance for today to avoid duplicates
        const existingAttendanceQuery = query(
            collection(db, 'attendance'),
            where('classId', '==', classId),
            where('date', '==', today)
        );

        const existingSnap = await getDocs(existingAttendanceQuery);

        if (!existingSnap.empty) {
            const response = confirm('يوجد تسجيل حضور موجود لهذا اليوم. هل تريد استبداله؟');
            if (!response) return;
        }

        // Show attendance form
        let attendanceList = `تسجيل الحضور لليوم: ${today}\n\n`;
        const students = [];
        let index = 1;

        studentsSnap.forEach(doc => {
            const student = doc.data();
            students.push({ id: doc.id, ...student });
            attendanceList += `${index}. ${student.fullName} (${student.studentCode}) - [1. حاضر / 2. غائب / 3. متأخر]\n`;
            index++;
        });

        attendanceList += '\nأدخل أرقام الحضور مفصولة بمسافة (مثلاً: 1 1 2 3):';

        const attendanceInput = prompt(attendanceList);
        if (!attendanceInput) return;

        const attendanceCodes = attendanceInput.trim().split(' ').map(code => parseInt(code));

        if (attendanceCodes.length !== students.length) {
            FirebaseHelpers.showToast('عدد الردود لا يتطابق مع عدد الطلاب', 'error');
            return;
        }

        // Process attendance
        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            const statusCode = attendanceCodes[i];

            let status = 'absent'; // default
            if (statusCode === 1) status = 'present';
            else if (statusCode === 2) status = 'absent';
            else if (statusCode === 3) status = 'late';

            // Save attendance record
            await addDoc(collection(db, 'attendance'), {
                studentId: student.id,
                studentName: student.fullName,
                classId: classId,
                className: '', // Will be populated with class name
                date: today,
                status: status,
                markedBy: currentTeacher.id,
                markedByName: currentTeacher.fullName,
                timestamp: serverTimestamp()
            });
        }

        // Get class name for confirmation
        const classDoc = await getDoc(doc(db, 'classes', classId));
        const className = classDoc.exists() ? classDoc.data().name : 'غير معروف';

        FirebaseHelpers.showToast(`تم تسجيل الحضور للفصل ${className} (${students.length} طالب)`, 'success');

        // Update statistics
        await loadStatistics();

    } catch (error) {
        FirebaseHelpers.logError('Record Attendance', error);
        FirebaseHelpers.showToast('فشل في تسجيل الحضور', 'error');
    }
}

// Show assignment modal
window.showAssignmentModal = async function () {
    try {
        if (!currentTeacher.classes || currentTeacher.classes.length === 0) {
            FirebaseHelpers.showToast('يجب اختيار فصول أولاً', 'error');
            return;
        }

        if (!currentTeacher.subject) {
            FirebaseHelpers.showToast('يجب تحديد المادة أولاً', 'error');
            return;
        }

        // Load classes into the select dropdown
        const classSelect = document.getElementById('assignmentClassSelect');
        classSelect.innerHTML = '<option value="">اختر الفصل</option>';

        for (let i = 0; i < currentTeacher.classes.length; i++) {
            const classId = currentTeacher.classes[i];
            const classDoc = await getDoc(doc(db, 'classes', classId));
            if (classDoc.exists()) {
                const classData = classDoc.data();
                const option = document.createElement('option');
                option.value = classId;
                option.textContent = classData.name;
                classSelect.appendChild(option);
            }
        }

        // Set default due date (7 days from now)
        const defaultDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        document.getElementById('assignmentDueDate').value = defaultDueDate;
        document.getElementById('assignmentMaxScore').value = '10';

        // Clear form fields
        document.getElementById('assignmentTitle').value = '';
        document.getElementById('assignmentDescription').value = '';

        // Show the modal
        document.getElementById('assignmentModal').style.display = 'block';

    } catch (error) {
        FirebaseHelpers.logError('Show Assignment Modal', error);
        FirebaseHelpers.showToast('فشل في فتح نموذج الواجب', 'error');
    }
};

// Create assignment from modal
window.createAssignmentFromModal = async function () {
    try {
        const classId = document.getElementById('assignmentClassSelect').value;
        const title = document.getElementById('assignmentTitle').value;
        const description = document.getElementById('assignmentDescription').value;
        const dueDate = document.getElementById('assignmentDueDate').value;
        const maxScore = parseInt(document.getElementById('assignmentMaxScore').value) || 10;

        if (!classId || !title || !description || !dueDate) {
            FirebaseHelpers.showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
            return;
        }

        await addDoc(collection(db, 'assignments'), {
            title: title,
            description: description,
            subject: currentTeacher.subject,
            classId: classId,
            teacherId: currentTeacher.id,
            teacherName: currentTeacher.fullName,
            dueDate: dueDate,
            maxScore: maxScore,
            status: 'active',
            createdAt: serverTimestamp()
        });

        FirebaseHelpers.showToast('تم إضافة الواجب بنجاح', 'success');
        closeModal('assignmentModal');
        await loadStatistics();
    } catch (error) {
        FirebaseHelpers.logError('Create Assignment', error);
        FirebaseHelpers.showToast('فشل إضافة الواجب', 'error');
    }
};

// Old function - now uses modal
window.createAssignment = async function (classId) {
    // Load the class in the modal and show it
    const classSelect = document.getElementById('assignmentClassSelect');
    classSelect.innerHTML = '<option value="">اختر الفصل</option>';

    const classDoc = await getDoc(doc(db, 'classes', classId));
    if (classDoc.exists()) {
        const classData = classDoc.data();
        const option = document.createElement('option');
        option.value = classId;
        option.textContent = classData.name;
        option.selected = true;
        classSelect.appendChild(option);
    }

    // Set default due date (7 days from now)
    const defaultDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    document.getElementById('assignmentDueDate').value = defaultDueDate;
    document.getElementById('assignmentMaxScore').value = '10';

    // Clear form fields
    document.getElementById('assignmentTitle').value = '';
    document.getElementById('assignmentDescription').value = '';

    // Show the modal
    document.getElementById('assignmentModal').style.display = 'block';
};

// Show grades modal
window.showGradesModal = async function () {
    try {
        if (!currentTeacher.classes || currentTeacher.classes.length === 0) {
            FirebaseHelpers.showToast('يجب اختيار فصول أولاً', 'error');
            return;
        }

        if (!currentTeacher.subject) {
            FirebaseHelpers.showToast('يجب تحديد المادة أولاً', 'error');
            return;
        }

        // Load classes into the select dropdown
        const classSelect = document.getElementById('gradesClassSelect');
        classSelect.innerHTML = '<option value="">اختر الفصل</option>';

        for (let i = 0; i < currentTeacher.classes.length; i++) {
            const classId = currentTeacher.classes[i];
            const classDoc = await getDoc(doc(db, 'classes', classId));
            if (classDoc.exists()) {
                const classData = classDoc.data();
                const option = document.createElement('option');
                option.value = classId;
                option.textContent = classData.name;
                classSelect.appendChild(option);
            }
        }

        // Clear other fields
        document.getElementById('gradesStudentSelect').innerHTML = '<option value="">جارٍ تحميل الطلاب...</option>';
        document.getElementById('gradeScore').value = '';
        document.getElementById('gradeMaxScore').value = '10';
        document.getElementById('gradeNotes').value = '';

        // Show the modal
        document.getElementById('gradesModal').style.display = 'block';

    } catch (error) {
        FirebaseHelpers.logError('Show Grades Modal', error);
        FirebaseHelpers.showToast('فشل في فتح نموذج الدرجات', 'error');
    }
};

// Load students for grades
window.loadStudentsForGrades = async function () {
    const classId = document.getElementById('gradesClassSelect').value;

    if (!classId) {
        document.getElementById('gradesStudentSelect').innerHTML = '<option value="">اختر فصلاً أولاً</option>';
        return;
    }

    try {
        // Get students in this class
        const studentsQuery = query(
            collection(db, 'students'),
            where('classId', '==', classId)
        );

        const studentsSnap = await getDocs(studentsQuery);

        const studentSelect = document.getElementById('gradesStudentSelect');
        studentSelect.innerHTML = '<option value="">اختر الطالب</option>';

        if (studentsSnap.empty) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'لا يوجد طلاب في هذا الفصل';
            option.disabled = true;
            studentSelect.appendChild(option);
        } else {
            studentsSnap.forEach(doc => {
                const student = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = `${student.fullName} (${student.studentCode})`;
                studentSelect.appendChild(option);
            });
        }

    } catch (error) {
        FirebaseHelpers.logError('Load Students for Grades', error);
        document.getElementById('gradesStudentSelect').innerHTML = '<option value="">خطأ في تحميل الطلاب</option>';
    }
};

// Add grade from modal
window.addGradeFromModal = async function () {
    try {
        const classId = document.getElementById('gradesClassSelect').value;
        const studentId = document.getElementById('gradesStudentSelect').value;
        const type = document.getElementById('gradeType').value;
        const score = parseFloat(document.getElementById('gradeScore').value);
        const maxScore = parseFloat(document.getElementById('gradeMaxScore').value) || 10;
        const notes = document.getElementById('gradeNotes').value;

        if (!classId || !studentId || !score) {
            FirebaseHelpers.showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
            return;
        }

        // Get student name
        const studentDoc = await getDoc(doc(db, 'students', studentId));
        const studentName = studentDoc.exists() ? studentDoc.data().fullName : 'طالب';

        await addDoc(collection(db, 'grades'), {
            studentId: studentId,
            studentName: studentName,
            classId: classId,
            teacherId: currentTeacher.id,
            teacherName: currentTeacher.fullName,
            subjectName: currentTeacher.subject,
            type: type,
            score: score,
            maxScore: maxScore,
            notes: notes || '',
            createdAt: serverTimestamp()
        });

        FirebaseHelpers.showToast(`تم إضافة درجة ${studentName}`, 'success');
        closeModal('gradesModal');
    } catch (error) {
        FirebaseHelpers.logError('Add Grade', error);
        FirebaseHelpers.showToast('فشل إضافة الدرجة', 'error');
    }
};

// Old function - now uses modal
window.viewGrades = async function (classId) {
    // Load the class in the modal and show it
    const classSelect = document.getElementById('gradesClassSelect');
    classSelect.innerHTML = '<option value="">اختر الفصل</option>';

    const classDoc = await getDoc(doc(db, 'classes', classId));
    if (classDoc.exists()) {
        const classData = classDoc.data();
        const option = document.createElement('option');
        option.value = classId;
        option.textContent = classData.name;
        option.selected = true;
        classSelect.appendChild(option);
    }

    // Load students for this class
    const studentsQuery = query(
        collection(db, 'students'),
        where('classId', '==', classId)
    );

    const studentsSnap = await getDocs(studentsQuery);
    const studentSelect = document.getElementById('gradesStudentSelect');
    studentSelect.innerHTML = '<option value="">اختر الطالب</option>';

    if (!studentsSnap.empty) {
        studentsSnap.forEach(doc => {
            const student = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = `${student.fullName} (${student.studentCode})`;
            studentSelect.appendChild(option);
        });
    }

    // Clear other fields
    document.getElementById('gradeScore').value = '';
    document.getElementById('gradeMaxScore').value = '10';
    document.getElementById('gradeNotes').value = '';

    // Show the modal
    document.getElementById('gradesModal').style.display = 'block';
};

async function addGrade(studentId, studentName, classId) {
    try {
        const typeOptions = 'نوع التقييم:\n1. واجب\n2. امتحان\n3. اختبار قصير';
        const typeChoice = prompt(typeOptions);
        if (!typeChoice) return;

        const types = ['assignment', 'exam', 'quiz'];
        const typeIndex = parseInt(typeChoice) - 1;
        if (typeIndex < 0 || typeIndex > 2) return;

        const type = types[typeIndex];

        const score = prompt('الدرجة التي حصل عليها الطالب:');
        if (!score) return;

        const maxScore = prompt('الدرجة العظمى:', '10');
        if (!maxScore) return;

        const notes = prompt('ملاحظات (اختياري):', '');

        await addDoc(collection(db, 'grades'), {
            studentId: studentId,
            studentName: studentName,
            classId: classId,
            teacherId: currentTeacher.id,
            teacherName: currentTeacher.fullName,
            subjectName: currentTeacher.subject,
            type: type,
            score: parseFloat(score) || 0,
            maxScore: parseFloat(maxScore) || 10,
            notes: notes || '',
            createdAt: serverTimestamp()
        });

        FirebaseHelpers.showToast(`تم إضافة درجة ${studentName}`, 'success');
    } catch (error) {
        FirebaseHelpers.logError('Add Grade', error);
        FirebaseHelpers.showToast('فشل إضافة الدرجة', 'error');
    }
}

window.showAttendanceModal = function () {
    FirebaseHelpers.showToast('اختر فصلاً من القائمة أدناه لتسجيل الحضور', 'info');
};

// Old function - now uses modal
window.showAssignmentModal = async function () {
    if (!currentTeacher.classes || currentTeacher.classes.length === 0) {
        FirebaseHelpers.showToast('يجب اختيار فصول أولاً', 'error');
        return;
    }

    if (!currentTeacher.subject) {
        FirebaseHelpers.showToast('يجب تحديد المادة أولاً', 'error');
        return;
    }

    // Load classes into the select dropdown
    const classSelect = document.getElementById('assignmentClassSelect');
    classSelect.innerHTML = '<option value="">اختر الفصل</option>';

    for (let i = 0; i < currentTeacher.classes.length; i++) {
        const classId = currentTeacher.classes[i];
        const classDoc = await getDoc(doc(db, 'classes', classId));
        if (classDoc.exists()) {
            const classData = classDoc.data();
            const option = document.createElement('option');
            option.value = classId;
            option.textContent = classData.name;
            classSelect.appendChild(option);
        }
    }

    // Set default due date (7 days from now)
    const defaultDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    document.getElementById('assignmentDueDate').value = defaultDueDate;
    document.getElementById('assignmentMaxScore').value = '10';

    // Clear form fields
    document.getElementById('assignmentTitle').value = '';
    document.getElementById('assignmentDescription').value = '';

    // Show the modal
    document.getElementById('assignmentModal').style.display = 'block';
};

// Old function - now uses modal
window.showGradesModal = async function () {
    if (!currentTeacher.classes || currentTeacher.classes.length === 0) {
        FirebaseHelpers.showToast('يجب اختيار فصول أولاً', 'error');
        return;
    }

    if (!currentTeacher.subject) {
        FirebaseHelpers.showToast('يجب تحديد المادة أولاً', 'error');
        return;
    }

    // Load classes into the select dropdown
    const classSelect = document.getElementById('gradesClassSelect');
    classSelect.innerHTML = '<option value="">اختر الفصل</option>';

    for (let i = 0; i < currentTeacher.classes.length; i++) {
        const classId = currentTeacher.classes[i];
        const classDoc = await getDoc(doc(db, 'classes', classId));
        if (classDoc.exists()) {
            const classData = classDoc.data();
            const option = document.createElement('option');
            option.value = classId;
            option.textContent = classData.name;
            classSelect.appendChild(option);
        }
    }

    // Clear other fields
    document.getElementById('gradesStudentSelect').innerHTML = '<option value="">جارٍ تحميل الطلاب...</option>';
    document.getElementById('gradeScore').value = '';
    document.getElementById('gradeMaxScore').value = '10';
    document.getElementById('gradeNotes').value = '';

    // Show the modal
    document.getElementById('gradesModal').style.display = 'block';
};

window.showAnnouncementModal = function () {
    FirebaseHelpers.showToast('سيتم إضافة وظيفة إرسال الإشعارات قريباً', 'info');
};

// ===== WEEKLY SCHEDULE MANAGEMENT =====

// Show schedule management modal
window.createWeeklySchedule = async function () {
    try {
        if (!currentTeacher.classes || currentTeacher.classes.length === 0) {
            FirebaseHelpers.showToast('يجب اختيار فصول أولاً', 'error');
            return;
        }

        if (!currentTeacher.subject) {
            FirebaseHelpers.showToast('يجب تحديد المادة أولاً', 'error');
            return;
        }

        // Load classes into the select dropdown
        const classSelect = document.getElementById('scheduleClassSelect');
        classSelect.innerHTML = '<option value="">اختر الفصل</option>';

        for (let i = 0; i < currentTeacher.classes.length; i++) {
            const classId = currentTeacher.classes[i];
            const classDoc = await getDoc(doc(db, 'classes', classId));
            if (classDoc.exists()) {
                const classData = classDoc.data();
                const option = document.createElement('option');
                option.value = classId;
                option.textContent = classData.name;
                classSelect.appendChild(option);
            }
        }

        // Show the modal
        document.getElementById('scheduleManagementModal').style.display = 'block';

    } catch (error) {
        FirebaseHelpers.logError('Show Schedule Management Modal', error);
        FirebaseHelpers.showToast('فشل في فتح نموذج الجدول', 'error');
    }
};

// Load schedule for class
window.loadScheduleForClass = async function () {
    const classId = document.getElementById('scheduleClassSelect').value;

    if (!classId) {
        document.getElementById('scheduleFormContent').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar"></i>
                <h3>اختر فصلاً</h3>
                <p>الرجاء اختيار فصل لعرض الجدول</p>
            </div>
        `;
        return;
    }

    try {
        // Get class name
        const classDoc = await getDoc(doc(db, 'classes', classId));
        const className = classDoc.exists() ? classDoc.data().name : 'فصل';

        // Get existing schedule for this class
        const scheduleQuery = query(
            collection(db, 'schedule'),
            where('classId', '==', classId),
            where('teacherId', '==', currentTeacher.id)
        );

        const scheduleSnap = await getDocs(scheduleQuery);

        // Organize schedule by day
        const scheduleByDay = {};
        scheduleSnap.forEach(doc => {
            const schedule = doc.data();
            if (!scheduleByDay[schedule.day]) {
                scheduleByDay[schedule.day] = [];
            }
            scheduleByDay[schedule.day].push(schedule);
        });

        // Days of the week in Arabic
        const daysOfWeek = [
            { id: 'saturday', name: 'السبت' },
            { id: 'sunday', name: 'الأحد' },
            { id: 'monday', name: 'الاثنين' },
            { id: 'tuesday', name: 'الثلاثاء' },
            { id: 'wednesday', name: 'الأربعاء' },
            { id: 'thursday', name: 'الخميس' },
            { id: 'friday', name: 'الجمعة' }
        ];

        let html = `<div class="schedule-form">
            <h4>الجدول للفصل: ${className}</h4>
            <div class="form-group">
                <label>هل تريد استبدال الجدول الحالي؟</label>
                <div>
                    <button class="btn btn-danger" onclick="clearScheduleForClass('${classId}')" style="margin-left: 10px;">حذف الجدول الحالي</button>
                    <button class="btn btn-secondary" onclick="addSessionToDay('saturday')">إضافة حصة</button>
                </div>
            </div>
        `;

        for (const day of daysOfWeek) {
            const daySessions = scheduleByDay[day.id] || [];

            html += `
                <div class="schedule-day">
                    <div class="schedule-day-header">
                        <h5>${day.name}</h5>
                        <button class="btn btn-primary" onclick="addSessionToDay('${day.id}')">إضافة حصة</button>
                    </div>
                    <div class="schedule-day-sessions" id="day_${day.id}_sessions">
            `;

            if (daySessions.length > 0) {
                daySessions.sort((a, b) => a.sessionOrder - b.sessionOrder);

                for (const session of daySessions) {
                    html += `
                        <div class="schedule-session-item">
                            <div class="session-details">
                                <span class="session-time-display">${session.startTime} - ${session.endTime}</span>
                                <span class="session-subject">(${session.subject})</span>
                            </div>
                            <div class="session-actions">
                                <button class="session-btn delete" onclick="removeSession('${session.id}', '${day.id}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }
            } else {
                html += `<p style="color: #7f8c8d; text-align: center; margin: 10px 0;">لا توجد حصص لهذا اليوم</p>`;
            }

            html += `
                    </div>
                </div>
            `;
        }

        html += '</div>';

        document.getElementById('scheduleFormContent').innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Schedule For Class', error);
        document.getElementById('scheduleFormContent').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطأ</h3>
                <p>فشل تحميل الجدول</p>
            </div>
        `;
    }
};

// Add session to day
window.addSessionToDay = function (dayId) {
    const daySessions = document.getElementById(`day_${dayId}_sessions`);

    if (!daySessions) return;

    const sessionCount = daySessions.querySelectorAll('.schedule-session-item').length;
    const sessionOrder = sessionCount + 1;

    const startTime = '08:00';
    const endTime = '08:45';

    const sessionHtml = `
        <div class="schedule-session" id="new_session_${dayId}_${sessionOrder}">
            <div class="session-time">
                <input type="time" class="form-control time-input" value="${startTime}" id="start_time_${dayId}_${sessionOrder}">
                <span>-</span>
                <input type="time" class="form-control time-input" value="${endTime}" id="end_time_${dayId}_${sessionOrder}">
            </div>
            <div class="session-info">
                <input type="text" class="form-control" value="${currentTeacher.subject}" id="subject_${dayId}_${sessionOrder}" placeholder="المادة">
            </div>
            <div class="session-actions">
                <button class="session-btn delete" onclick="removeNewSession('new_session_${dayId}_${sessionOrder}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;

    daySessions.innerHTML += sessionHtml;
};

// Remove new session
window.removeNewSession = function (sessionId) {
    const sessionElement = document.getElementById(sessionId);
    if (sessionElement) {
        sessionElement.remove();
    }
};

// Remove existing session
window.removeSession = async function (scheduleId, dayId) {
    if (!confirm('هل أنت متأكد من حذف هذه الحصة؟')) {
        return;
    }

    try {
        await deleteDoc(doc(db, 'schedule', scheduleId));
        FirebaseHelpers.showToast('تم حذف الحصة', 'success');

        // Refresh the schedule
        loadScheduleForClass();
    } catch (error) {
        FirebaseHelpers.logError('Remove Session', error);
        FirebaseHelpers.showToast('فشل حذف الحصة', 'error');
    }
};

// Clear schedule for class
window.clearScheduleForClass = async function (classId) {
    if (!confirm('هل أنت متأكد من حذف الجدول الكامل؟')) {
        return;
    }

    try {
        // Get existing schedule for this class
        const scheduleQuery = query(
            collection(db, 'schedule'),
            where('classId', '==', classId),
            where('teacherId', '==', currentTeacher.id)
        );

        const scheduleSnap = await getDocs(scheduleQuery);

        // Delete all schedule documents
        for (const doc of scheduleSnap.docs) {
            await deleteDoc(doc.ref);
        }

        FirebaseHelpers.showToast('تم حذف الجدول', 'success');

        // Refresh the schedule
        loadScheduleForClass();
    } catch (error) {
        FirebaseHelpers.logError('Clear Schedule For Class', error);
        FirebaseHelpers.showToast('فشل حذف الجدول', 'error');
    }
};

// Save weekly schedule
window.saveWeeklySchedule = async function () {
    const classId = document.getElementById('scheduleClassSelect').value;

    if (!classId) {
        FirebaseHelpers.showToast('يرجى اختيار فصل', 'error');
        return;
    }

    try {
        // Get class name
        const classDoc = await getDoc(doc(db, 'classes', classId));
        const className = classDoc.exists() ? classDoc.data().name : 'فصل';

        // Days of the week in Arabic
        const daysOfWeek = [
            'saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'
        ];

        // Collect all new sessions from the form
        for (const dayId of daysOfWeek) {
            const dayElement = document.getElementById(`day_${dayId}_sessions`);
            if (!dayElement) continue;

            // Get all new session elements
            const newSessions = dayElement.querySelectorAll('.schedule-session');

            for (let i = 0; i < newSessions.length; i++) {
                const session = newSessions[i];

                const startTimeInput = session.querySelector(`[id^='start_time_${dayId}']`);
                const endTimeInput = session.querySelector(`[id^='end_time_${dayId}']`);
                const subjectInput = session.querySelector(`[id^='subject_${dayId}']`);

                if (!startTimeInput || !endTimeInput || !subjectInput) continue;

                const startTime = startTimeInput.value;
                const endTime = endTimeInput.value;
                const subject = subjectInput.value || currentTeacher.subject;

                if (!startTime || !endTime) {
                    FirebaseHelpers.showToast('يرجى ملء أوقات الحصة', 'error');
                    return;
                }

                // Calculate session order based on start time
                const sessionOrder = i + 1;

                // Create schedule entry
                await addDoc(collection(db, 'schedule'), {
                    classId: classId,
                    className: className,
                    teacherId: currentTeacher.id,
                    teacherName: currentTeacher.fullName,
                    subject: subject,
                    day: dayId,
                    dayName: getDayName(dayId),
                    startTime: startTime,
                    endTime: endTime,
                    sessionOrder: sessionOrder,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }
        }

        FirebaseHelpers.showToast(`تم حفظ الجدول الأسبوعي للفصل ${className}`, 'success');

        // Refresh the schedule
        loadScheduleForClass();

    } catch (error) {
        FirebaseHelpers.logError('Save Weekly Schedule', error);
        FirebaseHelpers.showToast('فشل في حفظ الجدول: ' + error.message, 'error');
    }
};

// Helper function to get day name
function getDayName(dayId) {
    const dayNames = {
        'saturday': 'السبت',
        'sunday': 'الأحد',
        'monday': 'الاثنين',
        'tuesday': 'الثلاثاء',
        'wednesday': 'الأربعاء',
        'thursday': 'الخميس',
        'friday': 'الجمعة'
    };
    return dayNames[dayId] || dayId;
}

async function buildScheduleForClass(classId, className) {
    try {
        // Days of the week in Arabic
        const daysOfWeek = [
            { name: 'السبت', id: 'saturday' },
            { name: 'الأحد', id: 'sunday' },
            { name: 'الاثنين', id: 'monday' },
            { name: 'الثلاثاء', id: 'tuesday' },
            { name: 'الأربعاء', id: 'wednesday' },
            { name: 'الخميس', id: 'thursday' },
            { name: 'الجمعة', id: 'friday' }
        ];

        // Clear existing schedule for this class
        const existingScheduleQuery = query(
            collection(db, 'schedule'),
            where('classId', '==', classId),
            where('teacherId', '==', currentTeacher.id)
        );

        const existingSnap = await getDocs(existingScheduleQuery);

        // Confirm if there's existing schedule
        if (!existingSnap.empty) {
            const response = confirm('يوجد جدول موجود لهذا الفصل. هل تريد استبداله؟');
            if (!response) return;

            // Delete existing schedule
            for (const doc of existingSnap.docs) {
                await deleteDoc(doc.ref);
            }
        }

        // Create new schedule
        for (const day of daysOfWeek) {
            // Prompt for number of sessions for this day
            const numSessions = prompt(`عدد الحصص لـ ${day.name} (الحد الأقصى 5):`);
            if (!numSessions || parseInt(numSessions) <= 0) continue;

            const sessionCount = Math.min(parseInt(numSessions), 5);

            for (let i = 0; i < sessionCount; i++) {
                // Calculate start time based on session number (assuming 45-min sessions)
                const startHour = 8 + Math.floor(i * 0.75); // 8 AM start, 45 min per session
                const startMinute = (i * 45) % 60;
                const startTime = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;

                const endHour = startHour + Math.floor((startMinute + 45) / 60);
                const endMinute = (startMinute + 45) % 60;
                const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;

                // Create schedule entry
                await addDoc(collection(db, 'schedule'), {
                    classId: classId,
                    className: className,
                    teacherId: currentTeacher.id,
                    teacherName: currentTeacher.fullName,
                    subject: currentTeacher.subject,
                    day: day.id,
                    dayName: day.name,
                    startTime: startTime,
                    endTime: endTime,
                    sessionOrder: i + 1,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }
        }

        FirebaseHelpers.showToast(`تم إنشاء الجدول الأسبوعي للفصل ${className}`, 'success');

    } catch (error) {
        FirebaseHelpers.logError('Build Schedule For Class', error);
        FirebaseHelpers.showToast('فشل في إنشاء الجدول', 'error');
    }
}

// Show schedule log modal
window.viewCurrentSchedule = async function () {
    try {
        if (!currentTeacher.classes || currentTeacher.classes.length === 0) {
            FirebaseHelpers.showToast('يجب اختيار فصول أولاً', 'error');
            return;
        }

        // Load classes into the select dropdown
        const classSelect = document.getElementById('logClassSelect');
        classSelect.innerHTML = '<option value="">اختر الفصل</option>';

        for (let i = 0; i < currentTeacher.classes.length; i++) {
            const classId = currentTeacher.classes[i];
            const classDoc = await getDoc(doc(db, 'classes', classId));
            if (classDoc.exists()) {
                const classData = classDoc.data();
                const option = document.createElement('option');
                option.value = classId;
                option.textContent = classData.name;
                classSelect.appendChild(option);
            }
        }

        // Show the modal
        document.getElementById('scheduleLogModal').style.display = 'block';

    } catch (error) {
        FirebaseHelpers.logError('View Current Schedule', error);
        FirebaseHelpers.showToast('فشل في فتح نموذج سجل الجدول', 'error');
    }
};

// Load schedule log
window.loadScheduleLog = async function () {
    const classId = document.getElementById('logClassSelect').value;

    if (!classId) {
        document.getElementById('scheduleLogContent').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar"></i>
                <h3>اختر فصلاً</h3>
                <p>الرجاء اختيار فصل لعرض الجدول</p>
            </div>
        `;
        return;
    }

    try {
        // Get class name
        const classDoc = await getDoc(doc(db, 'classes', classId));
        const className = classDoc.exists() ? classDoc.data().name : 'فصل';

        // Get existing schedule for this class
        const scheduleQuery = query(
            collection(db, 'schedule'),
            where('classId', '==', classId),
            where('teacherId', '==', currentTeacher.id)
        );

        const scheduleSnap = await getDocs(scheduleQuery);

        if (scheduleSnap.empty) {
            document.getElementById('scheduleLogContent').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <h3>لا يوجد جدول</h3>
                    <p>لا يوجد جدول محفوظ لهذا الفصل</p>
                </div>
            `;
            return;
        }

        // Organize schedule by day
        const scheduleByDay = {};
        scheduleSnap.forEach(doc => {
            const schedule = doc.data();
            if (!scheduleByDay[schedule.day]) {
                scheduleByDay[schedule.day] = [];
            }
            scheduleByDay[schedule.day].push(schedule);
        });

        // Days of the week in Arabic
        const daysOfWeek = [
            { id: 'saturday', name: 'السبت' },
            { id: 'sunday', name: 'الأحد' },
            { id: 'monday', name: 'الاثنين' },
            { id: 'tuesday', name: 'الثلاثاء' },
            { id: 'wednesday', name: 'الأربعاء' },
            { id: 'thursday', name: 'الخميس' },
            { id: 'friday', name: 'الجمعة' }
        ];

        let html = `<div class="schedule-log">
            <h4>الجدول الأسبوعي للفصل: ${className}</h4>
        `;

        for (const day of daysOfWeek) {
            const daySessions = scheduleByDay[day.id] || [];

            if (daySessions.length > 0) {
                html += `
                    <div class="schedule-day">
                        <div class="schedule-day-header">
                            <h5>${day.name}</h5>
                        </div>
                        <div class="schedule-day-sessions">
                `;

                daySessions.sort((a, b) => a.sessionOrder - b.sessionOrder);

                for (const session of daySessions) {
                    html += `
                        <div class="schedule-session-item">
                            <div class="session-details">
                                <span class="session-time-display">${session.startTime} - ${session.endTime}</span>
                                <span class="session-subject">(${session.subject})</span>
                            </div>
                        </div>
                    `;
                }

                html += `
                        </div>
                    </div>
                `;
            }
        }

        html += '</div>';

        document.getElementById('scheduleLogContent').innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Schedule Log', error);
        document.getElementById('scheduleLogContent').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطأ</h3>
                <p>فشل تحميل سجل الجدول</p>
            </div>
        `;
    }
};

async function displayScheduleForClass(classId, className) {
    try {
        const scheduleQuery = query(
            collection(db, 'schedule'),
            where('classId', '==', classId),
            where('teacherId', '==', currentTeacher.id)
        );

        const scheduleSnap = await getDocs(scheduleQuery);

        if (scheduleSnap.empty) {
            FirebaseHelpers.showToast('لا يوجد جدول محفوظ لهذا الفصل', 'info');
            return;
        }

        // Organize schedule by day
        const scheduleByDay = {};
        scheduleSnap.forEach(doc => {
            const schedule = doc.data();
            if (!scheduleByDay[schedule.day]) {
                scheduleByDay[schedule.day] = [];
            }
            scheduleByDay[schedule.day].push(schedule);
        });

        // Sort by day and session order
        const daysOrder = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

        let scheduleDisplay = `الجدول الأسبوعي للفصل: ${className}\n\n`;

        for (const dayId of daysOrder) {
            const daySessions = scheduleByDay[dayId] || [];
            if (daySessions.length > 0) {
                const dayName = daySessions[0].dayName;
                scheduleDisplay += `\n${dayName}:\n`;

                daySessions.sort((a, b) => a.sessionOrder - b.sessionOrder);

                for (const session of daySessions) {
                    scheduleDisplay += `  ${session.sessionOrder}. ${session.startTime}-${session.endTime} - ${session.subject}\n`;
                }
            }
        }

        alert(scheduleDisplay);

    } catch (error) {
        FirebaseHelpers.logError('Display Schedule For Class', error);
        FirebaseHelpers.showToast('فشل في عرض الجدول', 'error');
    }
}

// ===== LOGOUT =====
window.logoutUser = async function () {
    try {
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    } catch (error) {
        FirebaseHelpers.logError('Logout', error);
        FirebaseHelpers.showToast('فشل تسجيل الخروج', 'error');
    }
};

// ===== SIDEBAR NAVIGATION =====

// Toggle sidebar
window.toggleSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');

    // Prevent body scroll when sidebar is open
    if (sidebar.classList.contains('active')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
};

// Close sidebar
window.closeSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    sidebar.classList.remove('active');
    overlay.classList.remove('active');

    // Restore body scroll
    document.body.style.overflow = '';
};

// Scroll to section
window.scrollToSection = function (sectionId) {
    const element = document.getElementById(sectionId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
    }
};