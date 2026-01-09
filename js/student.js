// js/student.js
import { db, FirebaseHelpers } from './firebaseConfig.js';
import { generateStudentQRCode } from './qrCodeUtils.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,


    where,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ===== STATE =====
let currentStudent = null;
let studentData = null;
let isLoading = false;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', init);

async function init() {
    if (isLoading) return;
    isLoading = true;

    try {
        // Get user from session
        const currentUserStr = sessionStorage.getItem('currentUser');
        if (!currentUserStr) {
            console.log('No user in init');
            isLoading = false;
            return;
        }

        const user = JSON.parse(currentUserStr);
        await loadStudentData(user.uid);

        await Promise.all([
            loadStatistics(),
            loadAssignments(),
            loadGrades(),
            loadWeeklySchedule()
        ]);

    } catch (error) {
        FirebaseHelpers.logError('Student Init', error);
        FirebaseHelpers.showToast('حدث خطأ في تحميل البيانات', 'error');
    } finally {
        isLoading = false;
    }
}

// ===== LOAD STUDENT DATA =====
async function loadStudentData(uid) {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));

        if (!userDoc.exists()) {
            console.error('User document not found');
            // Don't redirect - dashboardGuard handles this
            return;
        }

        currentStudent = { id: uid, ...userDoc.data() };

        if (currentStudent.role !== 'student') {
            console.error('User is not a student');
            // Don't redirect - dashboardGuard handles this
            return;
        }

        const studentsQuery = query(
            collection(db, 'students'),
            where('email', '==', currentStudent.email)
        );
        const studentsSnap = await getDocs(studentsQuery);

        if (!studentsSnap.empty) {
            studentData = { id: studentsSnap.docs[0].id, ...studentsSnap.docs[0].data() };
        }

        document.getElementById('userName').textContent = currentStudent.fullName;
        document.getElementById('welcomeName').textContent = currentStudent.fullName;
        document.getElementById('userAvatar').textContent = getInitials(currentStudent.fullName);

        if (studentData) {
            document.getElementById('studentCode').textContent = `الرقم: ${studentData.studentCode || '-'}`;
            document.getElementById('seatNumber').textContent = studentData.seatNumber || '-';

            if (studentData.classId) {
                const classDoc = await getDoc(doc(db, 'classes', studentData.classId));
                if (classDoc.exists()) {
                    const classInfo = classDoc.data();
                    document.getElementById('classBadge').textContent = classInfo.name || 'الفصل';
                    document.getElementById('studentClass').textContent = classInfo.name || '-';
                    document.getElementById('studentGrade').textContent = classInfo.grade || '-';

                    // Load teacher info
                    await loadTeacherInfo(studentData.classId);
                }
            }
        }

    } catch (error) {
        FirebaseHelpers.logError('Load Student', error);
        throw error;
    }
}

// ===== LOAD TEACHER INFO =====
async function loadTeacherInfo(classId) {
    try {
        // Find teacher assigned to this class
        const teachersQuery = query(
            collection(db, 'users'),
            where('role', '==', 'teacher'),
            where('classes', 'array-contains', classId)
        );

        const teachersSnap = await getDocs(teachersQuery);

        if (!teachersSnap.empty) {
            const teacher = teachersSnap.docs[0].data();

            // Update teacher info elements if they exist
            const teacherNameEl = document.getElementById('teacherName');
            const teacherSubjectEl = document.getElementById('teacherSubject');
            const teacherEmailEl = document.getElementById('teacherEmail');

            if (teacherNameEl) teacherNameEl.textContent = teacher.fullName || 'غير محدد';
            if (teacherSubjectEl) teacherSubjectEl.textContent = teacher.subject || 'غير محدد';
            if (teacherEmailEl) teacherEmailEl.textContent = teacher.email || 'غير متوفر';
        } else {
            const teacherNameEl = document.getElementById('teacherName');
            if (teacherNameEl) teacherNameEl.textContent = 'لم يتم تعيين معلم';
        }
    } catch (error) {
        FirebaseHelpers.logError('Load Teacher Info', error);
    }
}

// ===== LOAD STATISTICS =====
async function loadStatistics() {
    try {
        if (!currentStudent) return;

        const attendanceQuery = query(
            collection(db, 'attendance'),
            where('studentId', '==', currentStudent.id)
        );

        const attendanceSnap = await getDocs(attendanceQuery);
        let presentCount = 0;
        let totalCount = 0;

        attendanceSnap.forEach(doc => {
            const data = doc.data();
            if (data.status === 'present') presentCount++;
            totalCount++;
        });

        const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
        document.getElementById('attendanceRate').textContent = `${attendanceRate}%`;
        document.getElementById('schoolDay').textContent = totalCount;

        const assignmentsQuery = query(
            collection(db, 'assignments'),
            where('status', '==', 'active'),
            where('assignedTo', 'array-contains', currentStudent.id)
        );

        const assignmentsSnap = await getDocs(assignmentsQuery);
        const pendingCount = assignmentsSnap.size;
        animateCounter('pendingAssignments', pendingCount);

        const gradesQuery = query(
            collection(db, 'grades'),
            where('studentId', '==', currentStudent.id)
        );

        const gradesSnap = await getDocs(gradesQuery);
        let totalGrades = 0;
        let gradeCount = 0;

        // Sort grades by createdAt to get most recent for GPA calculation
        const sortedGrades = gradesSnap.docs.sort((a, b) => {
            const aData = a.data();
            const bData = b.data();

            let dateA, dateB;

            if (aData.createdAt && typeof aData.createdAt.toDate === 'function') {
                dateA = aData.createdAt.toDate();
            } else {
                dateA = new Date(0);
            }

            if (bData.createdAt && typeof bData.createdAt.toDate === 'function') {
                dateB = bData.createdAt.toDate();
            } else {
                dateB = new Date(0);
            }

            return dateB - dateA; // Descending order
        });

        sortedGrades.forEach(doc => {
            const data = doc.data();
            if (data.score && data.maxScore) {
                totalGrades += (data.score / data.maxScore) * 100;
                gradeCount++;
            }
        });

        const gpa = gradeCount > 0 ? (totalGrades / gradeCount).toFixed(1) : 0;
        document.getElementById('gpaScore').textContent = gpa;

        document.getElementById('progressPercentage').textContent = `${Math.round(gpa)}%`;
        document.getElementById('progressBar').style.width = `${gpa}%`;

        const subjectsSnap = await getDocs(collection(db, 'subjects'));
        animateCounter('totalSubjects', subjectsSnap.size);

    } catch (error) {
        FirebaseHelpers.logError('Load Statistics', error);
    }
}

// ===== LOAD ASSIGNMENTS =====
async function loadAssignments() {
    const container = document.getElementById('assignmentsContainer');

    try {
        if (!studentData || !studentData.classId) {
            container.innerHTML = createEmptyState(
                'لا توجد واجبات',
                'لم يتم تعيين أي واجبات بعد',
                'fas fa-tasks'
            );
            return;
        }

        // Query assignments by classId instead of assignedTo array
        const q = query(
            collection(db, 'assignments'),
            where('status', '==', 'active'),
            where('classId', '==', studentData.classId)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = createEmptyState(
                'لا توجد واجبات معلقة',
                'أحسنت! لقد أكملت جميع واجباتك',
                'fas fa-check-circle',
                '#27ae60'
            );
            return;
        }

        let html = '<div class="assignments-grid">';

        snapshot.forEach(doc => {
            const assignment = doc.data();

            const today = new Date();
            const dueDate = new Date(assignment.dueDate);
            const diffTime = dueDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let dueText = '';
            let priority = 'low';

            if (diffDays < 0) {
                dueText = 'متأخر';
                priority = 'high';
            } else if (diffDays === 0) {
                dueText = 'اليوم';
                priority = 'high';
            } else if (diffDays === 1) {
                dueText = 'غداً';
                priority = 'medium';
            } else {
                dueText = `${diffDays} يوم`;
                priority = diffDays <= 3 ? 'medium' : 'low';
            }

            const formattedDate = dueDate.toLocaleDateString('ar-EG', {
                month: 'short',
                day: 'numeric'
            });

            html += `
                <div class="assignment-card ${priority}">
                    <div class="assignment-header">
                        <h3>${assignment.title || 'واجب'}</h3>
                        <div class="due-badge">${dueText}</div>
                    </div>
                    <div class="assignment-body">
                        <p>${assignment.description || 'لا يوجد وصف'}</p>
                        <div class="assignment-meta">
                            <div class="meta-item">
                                <div class="label">المادة</div>
                                <div class="value">${assignment.subject || '-'}</div>
                            </div>
                            <div class="meta-item">
                                <div class="label">التسليم</div>
                                <div class="value">${formattedDate}</div>
                            </div>
                            <div class="meta-item">
                                <div class="label">الدرجة</div>
                                <div class="value">${assignment.maxScore || 0}</div>
                            </div>
                        </div>
                        <button class="assignment-btn" onclick="viewAssignment('${doc.id}')">
                            <i class="fas fa-eye"></i> عرض التفاصيل
                        </button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Assignments', error);
        container.innerHTML = createErrorState('فشل في تحميل الواجبات');
    }
}

// ===== LOAD GRADES =====
async function loadGrades() {
    const container = document.getElementById('gradesContainer');

    try {
        if (!currentStudent) {
            container.innerHTML = createEmptyState(
                'لا توجد درجات',
                'لم يتم إدخال درجات بعد',
                'fas fa-chart-line'
            );
            return;
        }

        const q = query(
            collection(db, 'grades'),
            where('studentId', '==', currentStudent.id)
        );

        const snapshot = await getDocs(q);

        // Sort documents by createdAt in descending order
        const sortedDocs = snapshot.docs.sort((a, b) => {
            const aData = a.data();
            const bData = b.data();

            let dateA, dateB;

            if (aData.createdAt && typeof aData.createdAt.toDate === 'function') {
                dateA = aData.createdAt.toDate();
            } else {
                dateA = new Date(0);
            }

            if (bData.createdAt && typeof bData.createdAt.toDate === 'function') {
                dateB = bData.createdAt.toDate();
            } else {
                dateB = new Date(0);
            }

            return dateB - dateA; // Descending order (newest first)
        });

        if (sortedDocs.length === 0) {
            container.innerHTML = createEmptyState(
                'لا توجد درجات',
                'لم يتم إدخال أي درجات حتى الآن',
                'fas fa-chart-line'
            );
            return;
        }

        let html = '<table><thead><tr>';
        html += '<th>المادة</th>';
        html += '<th>النوع</th>';
        html += '<th>الدرجة</th>';
        html += '<th>من</th>';
        html += '<th>النسبة</th>';
        html += '<th>التقدير</th>';
        html += '</tr></thead><tbody>';

        sortedDocs.forEach(doc => {
            const grade = doc.data();
            const percentage = grade.maxScore > 0
                ? ((grade.score / grade.maxScore) * 100).toFixed(1)
                : 0;

            let gradeClass = 'grade-poor';
            let gradeText = 'ضعيف';

            if (percentage >= 90) {
                gradeClass = 'grade-excellent';
                gradeText = 'ممتاز';
            } else if (percentage >= 75) {
                gradeClass = 'grade-good';
                gradeText = 'جيد جداً';
            } else if (percentage >= 60) {
                gradeClass = 'grade-average';
                gradeText = 'جيد';
            }

            const typeMap = {
                'assignment': 'واجب',
                'exam': 'امتحان',
                'quiz': 'اختبار قصير'
            };

            const gradeId = doc.id; // Get the document ID
            html += `<tr onclick="viewGrade('${gradeId}')" style="cursor: pointer;">
                <td><strong>${grade.subjectName || '-'}</strong></td>
                <td>${typeMap[grade.type] || grade.type || '-'}</td>
                <td>${grade.score || 0}</td>
                <td>${grade.maxScore || 0}</td>
                <td><strong>${percentage}%</strong></td>
                <td><span class="grade-badge ${gradeClass}">${gradeText}</span></td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Grades', error);
        container.innerHTML = createErrorState('فشل في تحميل الدرجات');
    }
}

// ===== LOAD WEEKLY SCHEDULE =====
async function loadWeeklySchedule() {
    const container = document.getElementById('weeklySchedule');

    try {
        if (!studentData || !studentData.classId) {
            container.innerHTML = createEmptyState(
                'لا يوجد جدول',
                'لم يتم تعيين جدول دراسي بعد',
                'fas fa-calendar-week'
            );
            return;
        }

        // Query schedule by classId
        const scheduleQuery = query(
            collection(db, 'schedule'),
            where('classId', '==', studentData.classId)
        );

        const scheduleSnapshot = await getDocs(scheduleQuery);

        if (scheduleSnapshot.empty) {
            container.innerHTML = createEmptyState(
                'لا يوجد جدول',
                'لم يتم إنشاء جدول دراسي لهذا الفصل بعد',
                'fas fa-calendar-times'
            );
            return;
        }

        // Days of the week in Arabic (excluding Friday and Saturday as holidays)
        const daysOfWeek = [
            { name: 'الأحد', id: 'sunday' },
            { name: 'الاثنين', id: 'monday' },
            { name: 'الثلاثاء', id: 'tuesday' },
            { name: 'الأربعاء', id: 'wednesday' },
            { name: 'الخميس', id: 'thursday' }
        ];

        // Organize sessions by day
        const scheduleByDay = {};
        scheduleSnapshot.forEach(doc => {
            const session = doc.data();
            const day = session.day.toLowerCase();

            // Skip Friday and Saturday (holidays)
            if (day === 'friday' || day === 'saturday') {
                return;
            }

            if (!scheduleByDay[day]) {
                scheduleByDay[day] = [];
            }

            scheduleByDay[day].push(session);
        });

        // Sort sessions by time within each day
        Object.keys(scheduleByDay).forEach(day => {
            scheduleByDay[day].sort((a, b) => {
                // Simple time comparison - assuming HH:MM format
                return a.startTime.localeCompare(b.startTime);
            });
        });

        // Build HTML for each day
        let html = '<div class="week-schedule">';

        daysOfWeek.forEach(day => {
            const daySessions = scheduleByDay[day.id] || [];

            html += `<div class="day-row">
                <div class="day-name">${day.name}</div>
                <div class="day-sessions">`;

            if (daySessions.length === 0) {
                html += `<div class="empty-session">
                    <small>لا توجد حصص</small>
                </div>`;
            } else {
                daySessions.forEach(session => {
                    // Determine session type based on time
                    let sessionType = 'morning';
                    if (session.startTime) {
                        const hour = parseInt(session.startTime.split(':')[0]);
                        if (hour >= 12 && hour < 17) sessionType = 'afternoon';
                        else if (hour >= 17) sessionType = 'evening';
                    }

                    html += `<div class="session-card ${sessionType}">
                        <div class="session-time">${session.startTime || ''} - ${session.endTime || ''}</div>
                        <div class="session-subject">${session.subject || 'غير محدد'}</div>
                        <div class="session-teacher">${session.teacherName || 'غير محدد'}</div>
                    </div>`;
                });
            }

            html += '</div></div>';
        });

        html += '</div>';
        container.innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Weekly Schedule', error);
        container.innerHTML = createErrorState('فشل في تحميل الجدول الأسبوعي');
    }
}

// ===== HELPER FUNCTIONS =====
function getInitials(name) {
    if (!name) return 'ط';
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

function createEmptyState(title, message, icon, color = '#7f8c8d') {
    return `
        <div class="empty-state">
            <i class="${icon}" style="color: ${color};"></i>
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

// ===== ACTION FUNCTIONS =====
window.viewAssignment = async function (assignmentId) {
    try {
        const assignmentDoc = await getDoc(doc(db, 'assignments', assignmentId));
        if (!assignmentDoc.exists()) {
            FirebaseHelpers.showToast('لم يتم العثور على الواجب', 'error');
            return;
        }

        const assignment = assignmentDoc.data();
        const dueDate = new Date(assignment.dueDate);
        const formattedDate = dueDate.toLocaleDateString('ar-EG', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Fill modal with assignment details
        document.getElementById('assignmentTitle').value = assignment.title || '-';
        document.getElementById('assignmentSubject').value = assignment.subject || '-';
        document.getElementById('assignmentTeacher').value = assignment.teacherName || '-';
        document.getElementById('assignmentDescription').value = assignment.description || 'لا يوجد';
        document.getElementById('assignmentDueDate').value = formattedDate;
        document.getElementById('assignmentMaxScore').value = assignment.maxScore || 0;

        // Show the modal
        document.getElementById('viewAssignmentModal').style.display = 'block';

    } catch (error) {
        FirebaseHelpers.logError('View Assignment', error);
        FirebaseHelpers.showToast('فشل عرض الواجب', 'error');
    }
};

window.viewGrade = async function (gradeId) {
    try {
        const gradeDoc = await getDoc(doc(db, 'grades', gradeId));
        if (!gradeDoc.exists()) {
            FirebaseHelpers.showToast('لم يتم العثور على الدرجة', 'error');
            return;
        }

        const grade = gradeDoc.data();

        // Format the date
        let formattedDate = 'غير محدد';
        if (grade.createdAt && typeof grade.createdAt.toDate === 'function') {
            const date = grade.createdAt.toDate();
            formattedDate = date.toLocaleDateString('ar-EG', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }

        // Calculate percentage
        const percentage = grade.maxScore > 0
            ? ((grade.score / grade.maxScore) * 100).toFixed(1)
            : 0;

        // Map grade types
        const typeMap = {
            'assignment': 'واجب',
            'exam': 'امتحان',
            'quiz': 'اختبار قصير',
            'project': 'مشروع',
            'participation': 'مشاركة'
        };

        // Fill modal with grade details
        document.getElementById('gradeSubject').value = grade.subjectName || '-';
        document.getElementById('gradeType').value = typeMap[grade.type] || grade.type || '-';
        document.getElementById('gradeScore').value = grade.score || 0;
        document.getElementById('gradeMaxScore').value = grade.maxScore || 0;
        document.getElementById('gradePercentage').value = `${percentage}%`;
        document.getElementById('gradeTeacher').value = grade.teacherName || '-';
        document.getElementById('gradeDate').value = formattedDate;
        document.getElementById('gradeNotes').value = grade.notes || 'لا توجد ملاحظات';

        // Show the modal
        document.getElementById('viewGradeModal').style.display = 'block';

    } catch (error) {
        FirebaseHelpers.logError('View Grade', error);
        FirebaseHelpers.showToast('فشل عرض التفاصيل', 'error');
    }
};

// ===== MODAL MANAGEMENT =====
window.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
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

// ===== QR CODE FUNCTIONALITY =====

// Display student QR code
window.showStudentQRCode = async function () {
    try {
        if (!currentStudent) {
            FirebaseHelpers.showToast('الرجاء تسجيل الدخول أولاً', 'error');
            return;
        }

        // Create modal for QR code display
        const qrModal = document.createElement('div');
        qrModal.className = 'modal';
        qrModal.id = 'studentQRModal';
        qrModal.style.display = 'block';
        qrModal.style.zIndex = '9999';
        qrModal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; margin: 100px auto; text-align: center;">
                <div class="modal-header">
                    <h3 class="modal-title">رمز الحضور</h3>
                    <button class="close-btn" onclick="closeStudentQRModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div id="qrCodeContainer" style="display: flex; justify-content: center; margin: 20px 0;">
                        <div class="loading">
                            <div class="spinner"></div>
                            <p>جارٍ إنشاء رمز QR...</p>
                        </div>
                    </div>
                    <p>أظهر هذا الرمز للمعلم لتسجيل الحضور</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeStudentQRModal()">إغلاق</button>
                </div>
            </div>
        `;

        document.body.appendChild(qrModal);

        // Generate QR code
        const qrCodeData = {
            type: 'student_attendance',
            studentId: currentStudent.id,
            studentName: currentStudent.fullName,
            timestamp: Date.now()
        };

        const qrCodeElement = await generateStudentQRCode(qrCodeData);

        // Replace loading spinner with QR code
        const container = document.getElementById('qrCodeContainer');
        container.innerHTML = '';
        container.appendChild(qrCodeElement);

        // Add close function to window
        window.closeStudentQRModal = function () {
            const modal = document.getElementById('studentQRModal');
            if (modal) {
                modal.remove();
            }
        };

    } catch (error) {
        FirebaseHelpers.logError('Show Student QR Code', error);
        FirebaseHelpers.showToast('فشل إنشاء رمز QR', 'error');

        // Close modal if it exists
        const modal = document.getElementById('studentQRModal');
        if (modal) {
            modal.remove();
        }
    }
};

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