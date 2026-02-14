// js/manager.js
import { db, FirebaseHelpers } from './firebaseConfig.js';
import { startAttendanceScanning, getAttendanceLogs, renderAttendanceLogs } from './attendanceManager.js';
import { initScanner, stopScanner } from './attendance-scanner.js';
import { initGenerator } from './generator.js';
import './dataManagement.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    setDoc,
    query,
    where,
    orderBy,
    updateDoc,
    deleteDoc,
    limit,
    serverTimestamp,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ===== STATE =====
let currentUser = null;
let isLoading = false;

// ===== UI NAVIGATION =====
// ===== UI NAVIGATION =====
window.toggleSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
};

window.closeSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
};

window.showSection = function (sectionId) {
    // Hide all main sections
    const sections = [
        'statsSection',
        'teachersManagementSection',
        'studentsManagementSection',
        'classesManagementSection',
        'teachersAttendanceSection',
        'studentsAttendanceSection',
        'scannerSection',
        'generatorSection',
        'dataManagementSection',
        'announcementsSection',
        'schedulesSection',
        'analyticsSection',
        'logsSection'
    ];

    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Show requested section
    const target = document.getElementById(sectionId);
    if (target) {
        target.style.display = 'block';

        // Save current section to session storage (optional, for page reload)
        sessionStorage.setItem('currentSection', sectionId);
    }

    // Handle specific section logic
    if (sectionId === 'teachersAttendanceSection') {
        const teacherSelect = document.getElementById('teachersAttendanceTeacherSelect');
        if (teacherSelect) populateTeacherSelect(teacherSelect);
    } else if (sectionId === 'studentsAttendanceSection') {
        const classSelect = document.getElementById('studentsAttendanceClassSelect');
        if (classSelect) populateClassSelect(classSelect);
    }

    const container = document.querySelector('.container');
    if (sectionId === 'dataManagementSection') {
        if (container) container.style.display = 'none';
        // loadClassesWithStudents(); // Removed as per new design
    } else {
        if (container) container.style.display = 'block';
    }

    if (sectionId === 'scannerSection') {
        // Initialize scanner (will handle library loading internally)
        initScanner('reader');
    } else {
        stopScanner();
    }

    if (sectionId === 'generatorSection') {
        initGenerator();
    }

    if (sectionId === 'studentsManagementSection') {
        loadClassesWithStudents();
    }

    if (sectionId === 'announcementsSection') {
        loadAnnouncements();
    }

    if (sectionId === 'analyticsSection') {
        loadAnalytics();
    }

    if (sectionId === 'logsSection') {
        loadActivityLogs();
    }

    if (sectionId === 'schedulesSection') {
        loadSchedules();
    }
};

// ===== ACTIVITY LOGGING HELPER =====
window.logActivity = async function (action, details) {
    try {
        const userStr = sessionStorage.getItem('currentUser');
        const user = userStr ? JSON.parse(userStr) : { email: 'System', role: 'admin' };

        await addDoc(collection(db, 'activity_logs'), {
            action,
            details,
            adminEmail: user.email,
            adminRole: user.role,
            timestamp: serverTimestamp()
        });
    } catch (error) {
        console.error('Error logging activity:', error);
    }
};

// ===== ACTIVITY LOGS SECTION =====
window.loadActivityLogs = async function () {
    const tableContent = document.getElementById('activityLogsTableContent');
    tableContent.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const q = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(50));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            tableContent.innerHTML = '<p style="text-align:center; padding:20px;">لا توجد نشاطات مسجلة بعد.</p>';
            return;
        }

        let html = `
            <table class="attendance-log-table">
                <thead>
                    <tr>
                        <th>الوقت</th>
                        <th>المسؤول</th>
                        <th>العملية</th>
                        <th>التفاصيل</th>
                    </tr>
                </thead>
                <tbody>
        `;

        snapshot.forEach(doc => {
            const log = doc.data();
            const time = log.timestamp ? log.timestamp.toDate().toLocaleString('ar-EG') : '-';
            html += `
                <tr>
                    <td>${time}</td>
                    <td><span class="badge" style="background:#f1c40f; color:#000;">${log.adminEmail}</span></td>
                    <td><strong>${log.action}</strong></td>
                    <td style="font-size: 13px;">${log.details}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        tableContent.innerHTML = html;

    } catch (error) {
        console.error('Load logs error:', error);
        tableContent.innerHTML = '<p style="color:red; text-align:center;">خطأ في تحميل السجل</p>';
    }
};

// ===== ANNOUNCEMENTS SECTION =====
window.loadAnnouncements = async function () {
    const container = document.getElementById('announcementsContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const q = query(collection(db, 'announcements'), orderBy('timestamp', 'desc'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<p style="text-align:center;">لا توجد إعلانات حالياً.</p>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const ann = doc.data();
            const time = ann.timestamp ? ann.timestamp.toDate().toLocaleDateString('ar-EG') : '-';
            const targetLabel = ann.target === 'all' ? 'للجميع' : (ann.target === 'teachers' ? 'للمعلمين' : 'للطلاب');

            html += `
                <div style="background:white; padding:20px; border-radius:12px; box-shadow:0 3px 10px rgba(0,0,0,0.05); border-right:5px solid #e67e22;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <h4 style="margin:0; color:#2c3e50;">${ann.title}</h4>
                        <span style="font-size:12px; color:#95a5a6;">${time}</span>
                    </div>
                    <p style="margin-bottom:15px; color:#7f8c8d; line-height:1.6;">${ann.body}</p>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11px; background:#fef5e7; color:#e67e22; padding:3px 10px; border-radius:15px;">${targetLabel}</span>
                        <button class="icon-btn delete" onclick="deleteAnnouncement('${doc.id}')" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

    } catch (error) {
        console.error('Load announcements error:', error);
        container.innerHTML = '<p>خطأ في تحميل الإعلانات</p>';
    }
};

window.showAnnouncementModal = function () {
    document.getElementById('announcementTitle').value = '';
    document.getElementById('announcementBody').value = '';
    document.getElementById('announcementModal').style.display = 'block';
};

window.publishAnnouncement = async function () {
    const title = document.getElementById('announcementTitle').value;
    const body = document.getElementById('announcementBody').value;
    const target = document.getElementById('announcementTarget').value;

    if (!title || !body) {
        FirebaseHelpers.showToast('يرجى كتابة العنوان والمحتوى', 'error');
        return;
    }

    try {
        await addDoc(collection(db, 'announcements'), {
            title,
            body,
            target,
            timestamp: serverTimestamp()
        });

        await logActivity('نشر إعلان', `تم نشر إعلان جديد بعنوان: ${title}`);
        FirebaseHelpers.showToast('تم نشر الإعلان بنجاح', 'success');
        closeModal('announcementModal');
        loadAnnouncements();
    } catch (error) {
        FirebaseHelpers.logError('Publish Announcement', error);
        FirebaseHelpers.showToast('فشل النشر', 'error');
    }
};

window.deleteAnnouncement = async function (id) {
    if (!confirm('هل تريد حذف هذا الإعلان؟')) return;
    try {
        await deleteDoc(doc(db, 'announcements', id));
        FirebaseHelpers.showToast('تم الحذف', 'success');
        loadAnnouncements();
    } catch (error) {
        FirebaseHelpers.showToast('فشل الحذف', 'error');
    }
};

// ===== ANALYTICS SECTION =====
let studentChart, teacherChart, classChart;

window.loadAnalytics = async function () {
    try {
        const stats = {
            studentAttendance: [65, 59, 80, 81, 56, 55, 40], // Example data
            teacherAttendance: [100, 95, 100, 90, 85, 100, 95],
            labels: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
        };

        // Real data fetching would go here (summary from collections)

        const ctxS = document.getElementById('studentAttendanceChart');
        if (ctxS) {
            if (studentChart) studentChart.destroy();
            studentChart = new Chart(ctxS, {
                type: 'line',
                data: {
                    labels: stats.labels,
                    datasets: [{
                        label: 'نسبة الحضور %',
                        data: stats.studentAttendance,
                        borderColor: '#2ecc71',
                        tension: 0.4,
                        fill: true,
                        backgroundColor: 'rgba(46, 204, 113, 0.1)'
                    }]
                }
            });
        }

        const ctxT = document.getElementById('teacherAttendanceChart');
        if (ctxT) {
            if (teacherChart) teacherChart.destroy();
            teacherChart = new Chart(ctxT, {
                type: 'line',
                data: {
                    labels: stats.labels,
                    datasets: [{
                        label: 'حضور المعلم %',
                        data: stats.teacherAttendance,
                        borderColor: '#3498db',
                        tension: 0.4
                    }]
                }
            });
        }

    } catch (error) {
        console.error('Analytics Error:', error);
    }
};

// ===== SCHEDULES SECTION =====
window.loadSchedules = async function () {
    const container = document.getElementById('schedulesContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const q = query(collection(db, 'schedules'), orderBy('classId'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<p style="text-align:center;">لا توجد جداول مسجلة.</p>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const sched = doc.data();
            html += `
                <div style="background:white; padding:15px; border-radius:10px; box-shadow:0 2px 5px rgba(0,0,0,0.05); display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h4 style="margin:0;">جدول : ${sched.className}</h4>
                        <small style="color:#7f8c8d;">يوم: ${sched.day}</small>
                    </div>
                    <div>
                        <button class="icon-btn delete" onclick="deleteSchedule('${doc.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = '<p>خطأ في تحميل الجداول</p>';
    }
};

window.showAddScheduleModal = async function () {
    const classSelect = document.getElementById('schedClassSelect');
    const classesSnap = await getDocs(collection(db, 'classes'));
    classSelect.innerHTML = '';
    classesSnap.forEach(doc => {
        const cls = doc.data();
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.dataset.name = cls.name;
        opt.textContent = cls.name;
        classSelect.appendChild(opt);
    });
    document.getElementById('scheduleModal').style.display = 'block';
};

window.saveSchedule = async function () {
    const classId = document.getElementById('schedClassSelect').value;
    const className = document.getElementById('schedClassSelect').options[document.getElementById('schedClassSelect').selectedIndex].dataset.name;
    const day = document.getElementById('schedDay').value;

    try {
        await addDoc(collection(db, 'schedules'), {
            classId,
            className,
            day,
            timestamp: serverTimestamp()
        });
        FirebaseHelpers.showToast('تم حفظ الجدول', 'success');
        closeModal('scheduleModal');
        loadSchedules();
    } catch (error) {
        FirebaseHelpers.showToast('فشل الحفظ', 'error');
    }
};

window.deleteSchedule = async function (id) {
    if (!confirm('حذف الجدول؟')) return;
    await deleteDoc(doc(db, 'schedules', id));
    loadSchedules();
};
document.addEventListener('DOMContentLoaded', init);

async function init() {
    if (isLoading) return;
    isLoading = true;

    try {
        // Show default section (Stats)
        window.showSection('statsSection');

        // Get user from session
        const currentUserStr = sessionStorage.getItem('currentUser');
        if (!currentUserStr) {
            console.log('No user in init');
            isLoading = false;
            return;
        }

        const user = JSON.parse(currentUserStr);
        await loadUserData(user.uid);

        // Update date/time immediately
        updateCurrentDateTime();

        // Start periodic updates
        startPeriodicUpdates();

        await Promise.all([
            loadStats(),
            loadTeachers(),
            loadClasses()
        ]);

    } catch (error) {
        FirebaseHelpers.logError('Manager Init', error);
        FirebaseHelpers.showToast('حدث خطأ في تحميل البيانات', 'error');
    } finally {
        isLoading = false;
    }
}

// ===== PERIODIC UPDATES =====
function startPeriodicUpdates() {
    // Update date/time every minute
    setInterval(updateCurrentDateTime, 60000);

    // Optional: Refresh data periodically (every 5 minutes)
    setInterval(async () => {
        try {
            await Promise.all([
                loadStats(),
                loadTeachers(),
                loadClasses()
            ]);
        } catch (error) {
            console.warn('Periodic update failed:', error);
        }
    }, 300000); // 5 minutes
}

// ===== DATE/TIME FUNCTIONS =====
function updateCurrentDateTime() {
    const now = new Date();
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    };
    const dateTimeString = now.toLocaleDateString('ar-EG', options);
    const currentDateTimeEl = document.getElementById('currentDateTime');
    if (currentDateTimeEl) {
        currentDateTimeEl.textContent = dateTimeString;
    }

    // Update date for attendance tracking
    const attendanceDateEl = document.getElementById('attendanceDate');
    if (attendanceDateEl) {
        attendanceDateEl.value = now.toISOString().split('T')[0];
    }
}

// ===== LOAD USER DATA =====
async function loadUserData(uid) {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));

        if (!userDoc.exists()) {
            console.error('User document not found');
            // Don't redirect - dashboardGuard handles this
            return;
        }

        currentUser = { id: uid, ...userDoc.data() };

        if (currentUser.role !== 'manager' && currentUser.role !== 'admin') {
            console.error('User is not a manager or admin');
            // Don't redirect - dashboardGuard handles this
            return;
        }

        document.getElementById('userName').textContent = currentUser.fullName;
        document.getElementById('welcomeName').textContent = currentUser.fullName;
        document.getElementById('userAvatar').textContent = getInitials(currentUser.fullName);

    } catch (error) {
        FirebaseHelpers.logError('Load User', error);
        throw error;
    }
}

// ===== LOAD STATISTICS =====
async function loadStats() {
    try {
        // Teachers
        const teachersQuery = query(collection(db, 'users'), where('role', '==', 'teacher'));

        // Students
        const studentsQuery = query(collection(db, 'users'), where('role', '==', 'student'));

        // Classes
        const classesRef = collection(db, 'classes');

        // Attendance (Today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const attendanceQuery = query(
            collection(db, 'attendance'),
            where('timestamp', '>=', today)
        );

        const [teachersSnap, studentsSnap, classesSnap, attendanceSnap] = await Promise.all([
            getDocs(teachersQuery),
            getDocs(studentsQuery),
            getDocs(classesRef),
            getDocs(attendanceQuery)
        ]);

        animateCounter('teachersCount', teachersSnap.size);
        animateCounter('studentsCount', studentsSnap.size);
        animateCounter('classesCount', classesSnap.size);
        animateCounter('attendanceCount', attendanceSnap.size);

    } catch (error) {
        FirebaseHelpers.logError('Load Stats', error);
    }
}

// ===== LOAD TEACHERS =====
async function loadTeachers() {
    const container = document.getElementById('teachersTableContent');

    try {
        // Remove orderBy to avoid index issues
        const q = query(
            collection(db, 'users'),
            where('role', '==', 'teacher')
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = createEmptyState(
                'لا يوجد مدرسين',
                'لم يتم تسجيل أي مدرس حتى الآن',
                'fas fa-user-tie'
            );
            return;
        }

        let html = '<table><thead><tr>';
        html += '<th>#</th>';
        html += '<th>الاسم</th>';
        html += '<th>البريد الإلكتروني</th>';
        html += '<th>المادة</th>';
        html += '<th>عدد الفصول</th>';
        html += '<th>الحالة</th>';
        html += '<th>الإجراءات</th>';
        html += '</tr></thead><tbody>';

        let index = 1;
        snapshot.forEach(doc => {
            const teacher = doc.data();
            const classesCount = teacher.classes ? teacher.classes.length : 0;

            html += `<tr>
                <td>${index++}</td>
                <td><strong>${teacher.fullName || '-'}</strong></td>
                <td>${teacher.email || '-'}</td>
                <td>${teacher.subject || '-'}</td>
                <td>${classesCount}</td>
                <td>
                    <span class="status-badge ${teacher.isActive !== false ? 'status-active' : 'status-inactive'}">
                        ${teacher.isActive !== false ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="icon-btn" onclick="showAssignTeacherToClassModal('${doc.id}', '${teacher.fullName}')" title="تعيين لفصل">
                            <i class="fas fa-user-plus"></i>
                        </button>
                        <button class="icon-btn edit" onclick="editTeacher('${doc.id}')" title="تعديل">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="icon-btn delete" onclick="confirmDelete('teacher', '${doc.id}', '${teacher.fullName}')" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button class="icon-btn" onclick="toggleStatus('${doc.id}', ${teacher.isActive !== false})" title="${teacher.isActive !== false ? 'تعطيل' : 'تفعيل'}">
                            <i class="fas fa-${teacher.isActive !== false ? 'ban' : 'check'}"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Teachers', error);
        container.innerHTML = createErrorState('فشل تحميل بيانات المدرسين');
    }
}

// ===== LOAD CLASSES =====
async function loadClasses() {
    const container = document.getElementById('classesTableContent');

    try {
        const snapshot = await getDocs(collection(db, 'classes'));

        if (snapshot.empty) {
            container.innerHTML = createEmptyState(
                'لا توجد فصول',
                'لم يتم إنشاء أي فصل دراسي حتى الآن',
                'fas fa-door-open'
            );
            return;
        }

        let html = '<table><thead><tr>';
        html += '<th>#</th>';
        html += '<th>اسم الفصل</th>';
        html += '<th>المرحلة</th>';
        html += '<th>السعة</th>';
        html += '<th>عدد الطلاب</th>';
        html += '<th>الإجراءات</th>';
        html += '</tr></thead><tbody>';

        let index = 1;

        const studentsSnap = await getDocs(collection(db, 'students'));
        const studentCounts = new Map();
        studentsSnap.forEach(doc => {
            const classId = doc.data().classId;
            studentCounts.set(classId, (studentCounts.get(classId) || 0) + 1);
        });

        snapshot.forEach(doc => {
            const classData = doc.data();
            const studentCount = studentCounts.get(doc.id) || 0;

            html += `<tr>
                <td>${index++}</td>
                <td><strong>${classData.name || '-'}</strong></td>
                <td>${classData.grade || '-'}</td>
                <td>${classData.capacity || 0}</td>
                <td>${studentCount}</td>
                <td>
                    <div class="table-actions">
                        <button class="icon-btn edit" onclick="editClass('${doc.id}')" title="تعديل">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="icon-btn delete" onclick="confirmDelete('class', '${doc.id}', '${classData.name}')" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button class="icon-btn" onclick="viewClassDetails('${doc.id}')" title="التفاصيل">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Classes', error);
        container.innerHTML = createErrorState('فشل تحميل بيانات الفصول');
    }
}

// ===== HELPER FUNCTIONS =====
function getInitials(name) {
    if (!name) return 'م';
    return name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();
}

function generateUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
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

function scrollToSection(id) {
    window.showSection(id);
}

// ===== CRUD OPERATIONS =====
async function toggleStatus(userId, currentStatus) {
    try {
        const newStatus = !currentStatus;

        // Update users collection
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
            FirebaseHelpers.showToast('المستخدم غير موجود', 'error');
            return;
        }

        const userData = userDoc.data();
        await updateDoc(userRef, { isActive: newStatus });

        // If it's a student, also update students collection
        if (userData.role === 'student' || userData.role === 'Student') {
            const studentRef = doc(db, 'students', userId);
            const studentDoc = await getDoc(studentRef);
            if (studentDoc.exists()) {
                await updateDoc(studentRef, { status: newStatus ? 'active' : 'inactive' });
            }
        }

        await logActivity('تغيير حالة حساب', `تم ${newStatus ? 'تفعيل' : 'تعطيل'} حساب: ${userData.fullName} (${userData.email})`);

        FirebaseHelpers.showToast(
            newStatus ? 'تم تفعيل المستخدم بنجاح' : 'تم تعطيل المستخدم بنجاح',
            'success'
        );

        if (userData.role === 'teacher') await loadTeachers();
        if (userData.role === 'student') {
            if (typeof loadClassesWithStudents === 'function') loadClassesWithStudents();
        }
        await loadStats();
    } catch (error) {
        FirebaseHelpers.logError('Toggle Status', error);
        FirebaseHelpers.showToast('فشل تغيير حالة المستخدم', 'error');
    }
}

async function confirmDelete(type, id, name) {
    if (!confirm(`هل أنت متأكد من حذف "${name}"؟\nهذه العملية لا يمكن التراجع عنها.`)) {
        return;
    }

    try {
        if (type === 'teacher') {
            await deleteDoc(doc(db, 'users', id));
            await logActivity('حذف معلم', `تم حذف المعلم: ${name} (ID: ${id})`);
            await loadTeachers();
        } else if (type === 'class') {
            await deleteDoc(doc(db, 'classes', id));
            await logActivity('حذف فصل', `تم حذف الفصل: ${name} (ID: ${id})`);
            await loadClasses();
        } else if (type === 'student') {
            // Delete from both collections
            await deleteDoc(doc(db, 'users', id));
            await deleteDoc(doc(db, 'students', id));
            await logActivity('حذف طالب', `تم حذف الطالب: ${name} (ID: ${id})`);
            if (typeof loadClassesWithStudents === 'function') loadClassesWithStudents();
        }

        FirebaseHelpers.showToast('تم الحذف بنجاح', 'success');
        await loadStats();
    } catch (error) {
        FirebaseHelpers.logError('Delete', error);
        FirebaseHelpers.showToast('فشل الحذف', 'error');
    }
}

// Old functions - now using modal system instead
// Keeping these for backward compatibility but they don't do anything
window.showAddTeacherModal_old = async () => {
    // This function is deprecated. Use the modal system instead.
    showAddTeacherModal();
};

window.showAddClassModal_old = async () => {
    // This function is deprecated. Use the modal system instead.
    showAddClassModal();
};

window.editTeacher_old = async (id) => {
    // This function is deprecated. Use the modal system instead.
    editTeacher(id);
};

window.editClass_old = async (id) => {
    // This function is deprecated. Use the modal system instead.
    editClass(id);
};

window.editStudent = async function (id) {
    try {
        const studentDoc = await getDoc(doc(db, 'students', id));
        if (!studentDoc.exists()) {
            FirebaseHelpers.showToast('لم يتم العثور على الطالب', 'error');
            return;
        }

        const student = studentDoc.data();
        document.getElementById('editStudentId').value = id;
        document.getElementById('editStudentFullName').value = student.fullName || '';
        document.getElementById('editStudentEmail').value = student.email || '';
        document.getElementById('editStudentCode').value = student.studentCode || '';

        // Populate class select
        const classSelect = document.getElementById('editStudentClassSelect');
        const classesSnap = await getDocs(collection(db, 'classes'));
        classSelect.innerHTML = '<option value="">بدون فصل</option>';
        classesSnap.forEach(cdoc => {
            const cls = cdoc.data();
            const opt = document.createElement('option');
            opt.value = cdoc.id;
            opt.textContent = cls.name;
            if (cdoc.id === student.classId) opt.selected = true;
            classSelect.appendChild(opt);
        });

        document.getElementById('editStudentModal').style.display = 'block';
    } catch (error) {
        FirebaseHelpers.logError('Edit Student', error);
        FirebaseHelpers.showToast('فشل تحميل بيانات الطالب', 'error');
    }
};

window.updateStudentFromModal = async function () {
    const id = document.getElementById('editStudentId').value;
    const fullName = document.getElementById('editStudentFullName').value;
    const email = document.getElementById('editStudentEmail').value;
    const studentCode = document.getElementById('editStudentCode').value;
    const classId = document.getElementById('editStudentClassSelect').value;

    if (!fullName || !email) {
        FirebaseHelpers.showToast('الاسم والبريد إلزامي', 'error');
        return;
    }

    try {
        // Update students collection
        await updateDoc(doc(db, 'students', id), {
            fullName,
            email,
            studentCode,
            classId
        });

        // Update users collection
        await updateDoc(doc(db, 'users', id), {
            fullName,
            email
        });

        await logActivity('تعديل بيانات طالب', `تم تحديث بيانات الطالب: ${fullName}`);
        FirebaseHelpers.showToast('تم تحديث بيانات الطالب بنجاح', 'success');
        closeModal('editStudentModal');
        if (typeof loadClassesWithStudents === 'function') loadClassesWithStudents();
    } catch (error) {
        FirebaseHelpers.logError('Update Student', error);
        FirebaseHelpers.showToast('فشل التحديث', 'error');
    }
};

window.viewTeacherDetails = async function (id) {
    const container = document.getElementById('teacherDetailsContent');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    document.getElementById('teacherDetailsModal').style.display = 'block';

    try {
        const teacherDoc = await getDoc(doc(db, 'users', id));
        if (!teacherDoc.exists()) {
            container.innerHTML = '<p>المعلم غير موجود</p>';
            return;
        }

        const teacher = teacherDoc.data();
        const classesIds = teacher.classes || [];

        let html = `
            <div class="teacher-info-header">
                <h3>${teacher.fullName}</h3>
                <p>${teacher.email} | ${teacher.subject || 'بدون تخصص'}</p>
            </div>
            <div class="teacher-assignments">
                <h4 style="margin: 20px 0 10px;">الفصول المسندة (${classesIds.length})</h4>
        `;

        if (classesIds.length === 0) {
            html += '<p>لا توجد فصول مسندة لهذا المعلم حالياً.</p>';
        } else {
            html += '<div style="display: grid; gap: 10px;">';
            for (const classId of classesIds) {
                const classDoc = await getDoc(doc(db, 'classes', classId));
                if (classDoc.exists()) {
                    const classData = classDoc.data();
                    html += `
                        <div style="background: #f8f9fa; padding: 10px; border-radius: 8px; border-right: 4px solid #3498db;">
                            <strong>${classData.name}</strong> (${classData.grade})
                        </div>
                    `;
                }
            }
            html += '</div>';
        }

        html += '</div>';
        container.innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('View Teacher Details', error);
        container.innerHTML = '<p>خطأ في تحميل البيانات</p>';
    }
};

// Old function replaced by modal-based version
// See viewClassDetails function in the modal section above

// Assign teacher to class
window.assignTeacherToClass = async (teacherId) => {
    try {
        console.log('assignTeacherToClass called for teacher:', teacherId);

        // Get available classes
        const classesSnap = await getDocs(collection(db, 'classes'));
        console.log('Classes found:', classesSnap.size);

        if (classesSnap.empty) {
            FirebaseHelpers.showToast('يجب إضافة فصول أولاً', 'error');
            return;
        }

        let classOptions = 'اختر الفصل لتعيينه:\n\n';
        const classList = [];
        classesSnap.forEach((doc, index) => {
            classList.push({ id: doc.id, ...doc.data() });
            classOptions += `${index + 1}. ${doc.data().name}\n`;
        });

        const classIndex = prompt(classOptions);
        console.log('User selected:', classIndex);

        if (!classIndex) return;

        // Convert to number and check if it's a valid number
        const index = parseInt(classIndex) - 1;
        if (isNaN(index) || index < 0 || index >= classList.length) {
            FirebaseHelpers.showToast('رقم غير صحيح', 'error');
            return;
        }

        const selectedClass = classList[index];
        console.log('Selected class:', selectedClass);

        // Get current teacher data
        const teacherDoc = await getDoc(doc(db, 'users', teacherId));
        if (!teacherDoc.exists()) {
            FirebaseHelpers.showToast('لم يتم العثور على المعلم', 'error');
            return;
        }

        const teacher = teacherDoc.data();
        const currentClasses = teacher.classes || [];
        console.log('Current teacher classes:', currentClasses);

        // Check if already assigned
        if (currentClasses.includes(selectedClass.id)) {
            FirebaseHelpers.showToast('المعلم معين بالفعل لهذا الفصل', 'info');
            return;
        }

        // Add class to teacher
        currentClasses.push(selectedClass.id);
        console.log('Updating to:', currentClasses);

        await updateDoc(doc(db, 'users', teacherId), {
            classes: currentClasses
        });

        FirebaseHelpers.showToast(`تم تعيين المعلم لـ ${selectedClass.name}`, 'success');
        await loadTeachers();
    } catch (error) {
        console.error('Assign Teacher Error:', error);
        FirebaseHelpers.logError('Assign Teacher', error);
        FirebaseHelpers.showToast('فشل التعيين: ' + error.message, 'error');
    }
};

// ===== TEACHER ATTENDANCE FUNCTIONS =====

// Show teacher attendance modal
// Show teacher attendance modal
window.showTeacherAttendance = async () => {
    try {
        // Get all teachers
        const teachersQuery = query(
            collection(db, 'users'),
            where('role', '==', 'teacher')
        );

        const teachersSnap = await getDocs(teachersQuery);

        if (teachersSnap.empty) {
            FirebaseHelpers.showToast('لا يوجد مدرسين', 'error');
            return;
        }

        let teacherOptions = 'اختر المعلم لتسجيل الحضور:\n\n';
        const teachersList = [];

        teachersSnap.forEach((doc, index) => {
            const teacher = doc.data();
            teachersList.push({ id: doc.id, ...teacher });
            teacherOptions += `${index + 1}. ${teacher.fullName} (${teacher.email})\n`;
        });

        const choice = prompt(teacherOptions + '\nأدخل رقم المعلم:');
        if (!choice) return;

        const index = parseInt(choice) - 1;
        if (isNaN(index) || index < 0 || index >= teachersList.length) {
            FirebaseHelpers.showToast('رقم غير صحيح', 'error');
            return;
        }

        const selectedTeacher = teachersList[index];

        // Ask for attendance status
        const statusOptions = 'اختر حالة الحضور:\n1. حاضر\n2. غائب\n3. متأخر';
        const statusChoice = prompt(statusOptions);

        if (!statusChoice) return;

        const statusMap = {
            '1': 'present',
            '2': 'absent',
            '3': 'late'
        };

        const status = statusMap[statusChoice];
        if (!status) {
            FirebaseHelpers.showToast('حالة غير صحيحة', 'error');
            return;
        }

        // Record attendance
        await recordTeacherAttendance(selectedTeacher.id, selectedTeacher.fullName, status);

    } catch (error) {
        FirebaseHelpers.logError('Teacher Attendance', error);
        FirebaseHelpers.showToast('فشل تسجيل الحضور', 'error');
    }
};

window.showAssignTeacherModal = async () => {
    try {
        const teacherSelect = document.getElementById('assignTeacherSelect');
        const teachersQuery = query(
            collection(db, 'users'),
            where('role', '==', 'teacher')
        );

        const teachersSnap = await getDocs(teachersQuery);

        // --- NEW MODAL LOGIC START ---
        const classSelect = document.getElementById('assignClassSelect');


        classSelect.innerHTML = '<option value="">جارٍ التحميل...</option>';
        document.getElementById('assignTeacherModal').style.display = 'block';

        teacherSelect.innerHTML = '<option value="">اختر المعلم</option>';
        if (teachersSnap.empty) {
            teacherSelect.innerHTML = '<option value="">لا يوجد معلمين</option>';
        } else {
            teachersSnap.forEach(doc => {
                const teacher = doc.data();
                const option = document.createElement('option');
                option.value = doc.id; // teacher UID
                option.textContent = teacher.fullName;
                teacherSelect.appendChild(option);
            });
        }

        // Load Classes
        const classesSnap = await getDocs(collection(db, 'classes'));

        classSelect.innerHTML = '<option value="">اختر الفصل</option>';
        if (classesSnap.empty) {
            classSelect.innerHTML = '<option value="">لا يوجد فصول</option>';
        } else {
            classesSnap.forEach(doc => {
                const classData = doc.data();
                const option = document.createElement('option');
                option.value = doc.id; // Class Doc ID
                option.textContent = classData.name;
                classSelect.appendChild(option);
            });
        }
        // --- NEW MODAL LOGIC END ---

        /*
        
        if (teachersSnap.empty) {
        FirebaseHelpers.showToast('لا يوجد مدرسين', 'error');
        return;
        }
        
        let teacherOptions = 'اختر المعلم لإسناد فصل له:\n\n';
        const teachersList = [];
        
        teachersSnap.forEach((doc, index) => {
        const teacher = doc.data();
        teachersList.push({ id: doc.id, ...teacher });
        teacherOptions += `${index + 1}. ${teacher.fullName}\n`;
        });
        
        const choice = prompt(teacherOptions + '\nأدخل رقم المعلم:');
        if (!choice) return;
        
        const index = parseInt(choice) - 1;
        if (isNaN(index) || index < 0 || index >= teachersList.length) {
        FirebaseHelpers.showToast('رقم غير صحيح', 'error');
        return;
        }
        
        const selectedTeacher = teachersList[index];
        
        // Now call the existing assign function
        assignTeacherToClass(selectedTeacher.id);
        
        */
    } catch (error) {
        console.error('Wrapper Error:', error);
        FirebaseHelpers.showToast('حدث خطأ', 'error');
    }
};

// Handle Assignment from Modal
window.assignTeacherToClassFromModal = async () => {
    try {
        const teacherId = document.getElementById('assignTeacherSelect').value;
        const classId = document.getElementById('assignClassSelect').value;

        if (!teacherId || !classId) {
            FirebaseHelpers.showToast('الرجاء اختيار المعلم والفصل', 'warning');
            return;
        }

        // Add class ID to teacher's classes array
        const teacherRef = doc(db, 'users', teacherId);

        // Use arrayUnion to add without duplicates
        await updateDoc(teacherRef, {
            classes: arrayUnion(classId)
        });

        FirebaseHelpers.showToast('تم إسناد الفصل للمعلم بنجاح', 'success');
        closeModal('assignTeacherModal');

        // Refresh tables
        if (typeof loadTeachers === 'function') loadTeachers();

    } catch (error) {
        console.error('Error assigning class:', error);
        FirebaseHelpers.showToast('فشل إسناد الفصل', 'error');
    }
};

// Record teacher attendance
async function recordTeacherAttendance(teacherId, teacherName, status) {
    try {
        // Ensure currentUser is available
        if (!currentUser || !currentUser.id || !currentUser.fullName) {
            FirebaseHelpers.showToast('خطأ: لم يتم تحميل بيانات المستخدم', 'error');
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        await addDoc(collection(db, 'teacher_attendance'), {
            teacherId: teacherId,
            teacherName: teacherName,
            date: today,
            status: status,
            recordedBy: currentUser.id,
            recordedByName: currentUser.fullName,
            timestamp: serverTimestamp()
        });

        FirebaseHelpers.showToast(`تم تسجيل الحضور للمعلم ${teacherName}`, 'success');
    } catch (error) {
        FirebaseHelpers.logError('Record Teacher Attendance', error);
        FirebaseHelpers.showToast('فشل تسجيل الحضور: ' + error.message, 'error');
    }
}

// View teacher attendance
window.viewTeacherAttendance = async () => {
    try {
        // Get all teachers
        const teachersQuery = query(
            collection(db, 'users'),
            where('role', '==', 'teacher')
        );

        const teachersSnap = await getDocs(teachersQuery);

        if (teachersSnap.empty) {
            FirebaseHelpers.showToast('لا يوجد مدرسين', 'error');
            return;
        }

        let teacherOptions = 'اختر المعلم لعرض سجل الحضور:\n\n';
        const teachersList = [];

        teachersSnap.forEach((doc, index) => {
            const teacher = doc.data();
            teachersList.push({ id: doc.id, ...teacher });
            teacherOptions += `${index + 1}. ${teacher.fullName} (${teacher.email})\n`;
        });

        const choice = prompt(teacherOptions + '\nأدخل رقم المعلم:');
        if (!choice) return;

        const index = parseInt(choice) - 1;
        if (isNaN(index) || index < 0 || index >= teachersList.length) {
            FirebaseHelpers.showToast('رقم غير صحيح', 'error');
            return;
        }

        const selectedTeacher = teachersList[index];

        // Get attendance records for the teacher (without orderBy)
        const attendanceQuery = query(
            collection(db, 'teacher_attendance'),
            where('teacherId', '==', selectedTeacher.id)
        );

        const attendanceSnap = await getDocs(attendanceQuery);

        if (attendanceSnap.empty) {
            alert(`${selectedTeacher.fullName}\nلا توجد سجلات حضور`);
            return;
        }

        // Sort documents by timestamp in descending order
        const sortedDocs = attendanceSnap.docs.sort((a, b) => {
            const aData = a.data();
            const bData = b.data();

            let dateA, dateB;

            if (aData.timestamp && typeof aData.timestamp.toDate === 'function') {
                dateA = aData.timestamp.toDate();
            } else {
                dateA = new Date(0);
            }

            if (bData.timestamp && typeof bData.timestamp.toDate === 'function') {
                dateB = bData.timestamp.toDate();
            } else {
                dateB = new Date(0);
            }

            return dateB - dateA; // Descending order (newest first)
        });

        let attendanceRecords = `${selectedTeacher.fullName}\nسجل الحضور:\n\n`;

        sortedDocs.forEach(doc => {
            const record = doc.data();
            const date = record.date;
            const statusArabic = record.status === 'present' ? 'حاضر' : record.status === 'absent' ? 'غائب' : 'متأخر';
            attendanceRecords += `${date} - ${statusArabic}\n`;
        });

        alert(attendanceRecords);
    } catch (error) {
        FirebaseHelpers.logError('View Teacher Attendance', error);
        FirebaseHelpers.showToast('فشل عرض سجل الحضور', 'error');
    }
};

// ===== MODAL FUNCTIONS =====
window.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
};

window.showAddTeacherModal = function () {
    document.getElementById('teacherFullName').value = '';
    document.getElementById('teacherEmail').value = '';
    document.getElementById('teacherSubject').value = '';
    document.getElementById('teacherPassword').value = '123456';
    document.getElementById('addTeacherModal').style.display = 'block';
};

window.addTeacherFromModal = async function () {
    const fullName = document.getElementById('teacherFullName').value;
    const email = document.getElementById('teacherEmail').value;
    const subject = document.getElementById('teacherSubject').value;
    const password = document.getElementById('teacherPassword').value;

    if (!fullName || !email || !subject) {
        FirebaseHelpers.showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
        return;
    }

    try {
        // Generate UID
        const uid = generateUID();

        // Add to users collection
        await setDoc(doc(db, 'users', uid), {
            email: email,
            password: password,
            fullName: fullName,
            role: 'teacher',
            subject: subject,
            classes: [],
            isActive: true,
            createdAt: serverTimestamp(),
            lastLogin: null
        });

        FirebaseHelpers.showToast('تم إضافة المعلم بنجاح', 'success');
        closeModal('addTeacherModal');
        await loadTeachers();
        await loadStats();
    } catch (error) {
        FirebaseHelpers.logError('Add Teacher', error);
        FirebaseHelpers.showToast('فشل إضافة المعلم: ' + error.message, 'error');
    }
};

window.editTeacher = function (id) {
    // Set the teacher ID in the hidden field
    document.getElementById('editTeacherId').value = id;

    // Load teacher data
    loadTeacherDataForEdit(id);
};

async function loadTeacherDataForEdit(id) {
    try {
        const teacherDoc = await getDoc(doc(db, 'users', id));
        if (!teacherDoc.exists()) {
            FirebaseHelpers.showToast('لم يتم العثور على المعلم', 'error');
            return;
        }

        const teacher = teacherDoc.data();
        document.getElementById('editTeacherFullName').value = teacher.fullName || '';
        document.getElementById('editTeacherSubject').value = teacher.subject || '';

        document.getElementById('editTeacherModal').style.display = 'block';
    } catch (error) {
        FirebaseHelpers.logError('Load Teacher Data', error);
        FirebaseHelpers.showToast('فشل تحميل بيانات المعلم', 'error');
    }
}

window.updateTeacherFromModal = async function () {
    const id = document.getElementById('editTeacherId').value;
    const fullName = document.getElementById('editTeacherFullName').value;
    const subject = document.getElementById('editTeacherSubject').value;

    if (!fullName || !subject) {
        FirebaseHelpers.showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
        return;
    }

    try {
        await updateDoc(doc(db, 'users', id), {
            fullName: fullName,
            subject: subject
        });

        FirebaseHelpers.showToast('تم تحديث بيانات المعلم', 'success');
        closeModal('editTeacherModal');
        await loadTeachers();
    } catch (error) {
        FirebaseHelpers.logError('Update Teacher', error);
        FirebaseHelpers.showToast('فشل التحديث: ' + error.message, 'error');
    }
};

window.showAddClassModal = function () {
    document.getElementById('className').value = '';
    document.getElementById('classGrade').value = '';
    document.getElementById('classCapacity').value = '30';
    document.getElementById('addClassModal').style.display = 'block';
};

window.addClassFromModal = async function () {
    const name = document.getElementById('className').value;
    const grade = document.getElementById('classGrade').value;
    const capacity = document.getElementById('classCapacity').value;

    if (!name || !grade) {
        FirebaseHelpers.showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
        return;
    }

    try {
        await addDoc(collection(db, 'classes'), {
            name: name,
            grade: grade,
            capacity: parseInt(capacity) || 30,
            createdAt: serverTimestamp()
        });

        FirebaseHelpers.showToast('تم إضافة الفصل بنجاح', 'success');
        closeModal('addClassModal');
        await loadClasses();
        await loadStats();
    } catch (error) {
        FirebaseHelpers.logError('Add Class', error);
        FirebaseHelpers.showToast('فشل إضافة الفصل: ' + error.message, 'error');
    }
};

window.editClass = function (id) {
    // Set the class ID in the hidden field
    document.getElementById('editClassId').value = id;

    // Load class data
    loadClassDataForEdit(id);
};

async function loadClassDataForEdit(id) {
    try {
        const classDoc = await getDoc(doc(db, 'classes', id));
        if (!classDoc.exists()) {
            FirebaseHelpers.showToast('لم يتم العثور على الفصل', 'error');
            return;
        }

        const classData = classDoc.data();
        document.getElementById('editClassName').value = classData.name || '';
        document.getElementById('editClassGrade').value = classData.grade || '';
        document.getElementById('editClassCapacity').value = classData.capacity || 30;

        document.getElementById('editClassModal').style.display = 'block';
    } catch (error) {
        FirebaseHelpers.logError('Load Class Data', error);
        FirebaseHelpers.showToast('فشل تحميل بيانات الفصل', 'error');
    }
}

window.updateClassFromModal = async function () {
    const id = document.getElementById('editClassId').value;
    const name = document.getElementById('editClassName').value;
    const grade = document.getElementById('editClassGrade').value;
    const capacity = document.getElementById('editClassCapacity').value;

    if (!name || !grade) {
        FirebaseHelpers.showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
        return;
    }

    try {
        await updateDoc(doc(db, 'classes', id), {
            name: name,
            grade: grade,
            capacity: parseInt(capacity) || 30
        });

        FirebaseHelpers.showToast('تم تحديث بيانات الفصل', 'success');
        closeModal('editClassModal');
        await loadClasses();
    } catch (error) {
        FirebaseHelpers.logError('Update Class', error);
        FirebaseHelpers.showToast('فشل التحديث: ' + error.message, 'error');
    }
};

// ===== ATTENDANCE MODALS =====

// Show student attendance logs
window.showStudentAttendanceLogs = async function () {
    try {
        // Create modal for attendance logs
        const logsModal = document.createElement('div');
        logsModal.className = 'modal';
        logsModal.id = 'attendanceLogsModal';
        logsModal.style.display = 'block';
        logsModal.style.zIndex = '9999';
        logsModal.innerHTML = `
<div class="modal-content" style="max-width: 1000px; margin: 20px auto;">
<div class="modal-header">
    <h3 class="modal-title">سجلات الحضور</h3>
    <button class="close-btn" onclick="closeAttendanceLogsModal()">&times;</button>
</div>
<div class="modal-body">
    <div class="form-group">
        <label for="logsDate">اختر التاريخ</label>
        <input type="date" id="logsDate" class="form-control" value="${new Date().toISOString().split('T')[0]}">
    </div>
    <div id="attendanceLogsContent">
        <div class="loading">
            <div class="spinner"></div>
            <p>جارٍ تحميل سجلات الحضور...</p>
        </div>
    </div>
</div>
<div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeAttendanceLogsModal()">إغلاق</button>
</div>
</div>
`;

        document.body.appendChild(logsModal);

        // Load attendance logs for today
        await loadAttendanceLogsForDate();

        // Add event listener for date change
        document.getElementById('logsDate').addEventListener('change', loadAttendanceLogsForDate);

        // Add close function to window
        window.closeAttendanceLogsModal = function () {
            const modal = document.getElementById('attendanceLogsModal');
            if (modal) {
                modal.remove();
            }
        };

    } catch (error) {
        FirebaseHelpers.logError('Show Attendance Logs', error);
        FirebaseHelpers.showToast('فشل عرض سجلات الحضور', 'error');

        // Close modal if it exists
        const modal = document.getElementById('attendanceLogsModal');
        if (modal) {
            modal.remove();
        }
    }
};

// Load attendance logs for selected date
async function loadAttendanceLogsForDate() {
    try {
        const dateInput = document.getElementById('logsDate');
        const selectedDate = dateInput.value;

        if (!selectedDate) {
            FirebaseHelpers.showToast('الرجاء اختيار تاريخ', 'error');
            return;
        }

        // Convert to Date object
        const date = new Date(selectedDate);

        // Get attendance logs
        const attendanceLogs = await getAttendanceLogs(date);

        // Render the logs
        renderAttendanceLogs(attendanceLogs, 'attendanceLogsContent');

    } catch (error) {
        FirebaseHelpers.logError('Load Attendance Logs', error);
        document.getElementById('attendanceLogsContent').innerHTML = `
<div class="empty-state">
<i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>
<h3>حدث خطأ</h3>
<p>فشل تحميل سجلات الحضور</p>
</div>
`;
    }
}

// Show teacher attendance modal
window.showTeacherAttendance = async function () {
    try {
        // Load teachers into the select dropdown
        const teachersQuery = query(
            collection(db, 'users'),
            where('role', '==', 'teacher')
        );

        const teachersSnap = await getDocs(teachersQuery);

        const selectElement = document.getElementById('attendanceTeacherSelect');
        selectElement.innerHTML = '<option value="">اختر المعلم</option>';

        teachersSnap.forEach(doc => {
            const teacher = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = `${teacher.fullName} (${teacher.email})`;
            selectElement.appendChild(option);
        });

        // Set today's date
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('attendanceDate').value = today;

        // Show the modal
        document.getElementById('teacherAttendanceModal').style.display = 'block';

    } catch (error) {
        FirebaseHelpers.logError('Load Teachers for Attendance', error);
        FirebaseHelpers.showToast('فشل تحميل المعلمين', 'error');
    }
};

// Record teacher attendance from modal
window.recordTeacherAttendanceFromModal = async function () {
    const teacherId = document.getElementById('attendanceTeacherSelect').value;
    const date = document.getElementById('attendanceDate').value;
    const status = document.getElementById('attendanceStatus').value;

    if (!teacherId || !date || !status) {
        FirebaseHelpers.showToast('يرجى ملء جميع الحقول', 'error');
        return;
    }

    try {
        // Get teacher data
        const teacherDoc = await getDoc(doc(db, 'users', teacherId));
        if (!teacherDoc.exists()) {
            FirebaseHelpers.showToast('لم يتم العثور على المعلم', 'error');
            return;
        }

        const teacher = teacherDoc.data();

        // Ensure currentUser is available
        if (!currentUser || !currentUser.id || !currentUser.fullName) {
            FirebaseHelpers.showToast('خطأ: لم يتم تحميل بيانات المستخدم', 'error');
            return;
        }

        // Check if attendance already exists for this date
        const existingAttendanceQuery = query(
            collection(db, 'teacher_attendance'),
            where('teacherId', '==', teacherId),
            where('date', '==', date)
        );

        const existingSnap = await getDocs(existingAttendanceQuery);

        if (!existingSnap.empty) {
            const confirmUpdate = confirm('يوجد تسجيل حضور موجود لهذا التاريخ. هل تريد تحديثه؟');
            if (!confirmUpdate) return;

            // Update existing record
            const attendanceDoc = existingSnap.docs[0];
            await updateDoc(doc(db, 'teacher_attendance', attendanceDoc.id), {
                status: status,
                recordedBy: currentUser.id,
                recordedByName: currentUser.fullName,
                timestamp: serverTimestamp()
            });
        } else {
            // Create new record
            await addDoc(collection(db, 'teacher_attendance'), {
                teacherId: teacherId,
                teacherName: teacher.fullName,
                date: date,
                status: status,
                recordedBy: currentUser.id,
                recordedByName: currentUser.fullName,
                timestamp: serverTimestamp()
            });
        }

        FirebaseHelpers.showToast(`تم تسجيل الحضور للمعلم ${teacher.fullName}`, 'success');
        closeModal('teacherAttendanceModal');

    } catch (error) {
        FirebaseHelpers.logError('Record Teacher Attendance', error);
        FirebaseHelpers.showToast('فشل تسجيل الحضور: ' + error.message, 'error');
    }
};

// View teacher attendance log modal
window.viewTeacherAttendance = async function () {
    try {
        // Load teachers into the select dropdown
        const teachersQuery = query(
            collection(db, 'users'),
            where('role', '==', 'teacher')
        );

        const teachersSnap = await getDocs(teachersQuery);

        const selectElement = document.getElementById('logTeacherSelect');
        selectElement.innerHTML = '<option value="">اختر المعلم</option>';

        teachersSnap.forEach(doc => {
            const teacher = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = `${teacher.fullName} (${teacher.email})`;
            selectElement.appendChild(option);
        });

        // Show the modal
        document.getElementById('viewAttendanceLogModal').style.display = 'block';

        // Clear previous content
        document.getElementById('attendanceLogContent').innerHTML = `
<div class="loading">
<div class="spinner"></div>
<p>جارٍ تحميل سجل الحضور...</p>
</div>
`;

    } catch (error) {
        FirebaseHelpers.logError('Load Teachers for Log', error);
        FirebaseHelpers.showToast('فشل تحميل المعلمين', 'error');
    }
};

// Load attendance log for selected teacher
window.loadAttendanceLog = async function () {
    const teacherId = document.getElementById('logTeacherSelect').value;

    if (!teacherId) {
        document.getElementById('attendanceLogContent').innerHTML = `
<div class="empty-state">
<i class="fas fa-user-clock"></i>
<h3>اختر معلم</h3>
<p>الرجاء اختيار معلم لعرض سجل الحضور</p>
</div>
`;
        return;
    }

    try {
        // Get teacher data
        const teacherDoc = await getDoc(doc(db, 'users', teacherId));
        const teacher = teacherDoc.exists() ? teacherDoc.data() : { fullName: 'معلم' };

        // Get attendance records for the teacher
        const attendanceQuery = query(
            collection(db, 'teacher_attendance'),
            where('teacherId', '==', teacherId)
        );

        const attendanceSnap = await getDocs(attendanceQuery);

        if (attendanceSnap.empty) {
            document.getElementById('attendanceLogContent').innerHTML = `
<div class="empty-state">
    <i class="fas fa-calendar-times"></i>
    <h3>لا توجد سجلات</h3>
    <p>لا توجد سجلات حضور لهذا المعلم</p>
</div>
`;
            return;
        }

        // Sort documents by timestamp in descending order
        const sortedDocs = attendanceSnap.docs.sort((a, b) => {
            const aData = a.data();
            const bData = b.data();

            let dateA, dateB;

            if (aData.timestamp && typeof aData.timestamp.toDate === 'function') {
                dateA = aData.timestamp.toDate();
            } else {
                dateA = new Date(0);
            }

            if (bData.timestamp && typeof bData.timestamp.toDate === 'function') {
                dateB = bData.timestamp.toDate();
            } else {
                dateB = new Date(0);
            }

            return dateB - dateA; // Descending order (newest first)
        });

        let html = `
<div class="attendance-log-header">
<h4>سجل حضور: ${teacher.fullName}</h4>
<p>إجمالي السجلات: ${sortedDocs.length}</p>
</div>
<div class="attendance-log-table-container">
<table class="attendance-log-table">
    <thead>
        <tr>
            <th>التاريخ</th>
            <th>الحالة</th>
            <th>سُجل بواسطة</th>
            <th>الوقت</th>
        </tr>
    </thead>
    <tbody>
`;

        sortedDocs.forEach(doc => {
            const record = doc.data();
            const timestamp = record.timestamp;
            let formattedTime = 'غير محدد';

            if (timestamp && typeof timestamp.toDate === 'function') {
                const dateObj = timestamp.toDate();
                formattedTime = dateObj.toLocaleTimeString('ar-EG', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }

            const statusArabic = record.status === 'present' ? 'حاضر' :
                record.status === 'absent' ? 'غائب' : 'متأخر';

            html += `
<tr>
    <td>${record.date}</td>
    <td><span class="status-badge status-${record.status}">${statusArabic}</span></td>
    <td>${record.recordedByName || 'نظام'}</td>
    <td>${formattedTime}</td>
</tr>
`;
        });

        html += `
    </tbody>
</table>
</div>
`;

        document.getElementById('attendanceLogContent').innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Attendance Log', error);
        document.getElementById('attendanceLogContent').innerHTML = `
<div class="empty-state">
<i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>
<h3>حدث خطأ</h3>
<p>فشل تحميل سجل الحضور</p>
</div>
`;
    }
};

// Show assign teacher to class modal
window.showAssignTeacherToClassModal = async function (teacherId, teacherName) {
    try {
        // Load teachers into the select dropdown
        const teachersQuery = query(
            collection(db, 'users'),
            where('role', '==', 'teacher')
        );

        const teachersSnap = await getDocs(teachersQuery);

        const teacherSelect = document.getElementById('assignTeacherSelect');
        teacherSelect.innerHTML = '';

        teachersSnap.forEach(doc => {
            const teacher = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = `${teacher.fullName} (${teacher.email})`;

            // Pre-select the current teacher if provided
            if (doc.id === teacherId) {
                option.selected = true;
            }

            teacherSelect.appendChild(option);
        });

        // Load classes into the select dropdown
        const classesQuery = query(collection(db, 'classes'));

        const classesSnap = await getDocs(classesQuery);

        const classSelect = document.getElementById('assignClassSelect');
        classSelect.innerHTML = '<option value="">اختر الفصل</option>';

        classesSnap.forEach(doc => {
            const classData = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = `${classData.name} (${classData.grade})`;
            classSelect.appendChild(option);
        });

        // Show the modal
        document.getElementById('assignTeacherModal').style.display = 'block';

    } catch (error) {
        FirebaseHelpers.logError('Load Teachers and Classes', error);
        FirebaseHelpers.showToast('فشل تحميل البيانات', 'error');
    }
};

// Assign teacher to class from modal
window.assignTeacherToClassFromModal = async function () {
    const teacherId = document.getElementById('assignTeacherSelect').value;
    const classId = document.getElementById('assignClassSelect').value;

    if (!teacherId || !classId) {
        FirebaseHelpers.showToast('يرجى اختيار المعلم والفصل', 'error');
        return;
    }

    try {
        // Get current teacher data
        const teacherDoc = await getDoc(doc(db, 'users', teacherId));
        if (!teacherDoc.exists()) {
            FirebaseHelpers.showToast('لم يتم العثور على المعلم', 'error');
            return;
        }

        const teacher = teacherDoc.data();
        const currentClasses = teacher.classes || [];

        // Check if already assigned
        if (currentClasses.includes(classId)) {
            FirebaseHelpers.showToast('المعلم معين بالفعل لهذا الفصل', 'info');
            return;
        }

        // Add class to teacher
        currentClasses.push(classId);

        await updateDoc(doc(db, 'users', teacherId), {
            classes: currentClasses
        });

        // Get class name for confirmation
        const classDoc = await getDoc(doc(db, 'classes', classId));
        const className = classDoc.exists() ? classDoc.data().name : 'فصل';

        FirebaseHelpers.showToast(`تم تعيين المعلم لـ ${className}`, 'success');
        closeModal('assignTeacherModal');
        await loadTeachers(); // Reload teachers to show updated class count

    } catch (error) {
        FirebaseHelpers.logError('Assign Teacher to Class', error);
        FirebaseHelpers.showToast('فشل التعيين: ' + error.message, 'error');
    }
};

// View class details modal
window.viewClassDetails = async function (classId) {
    try {
        // Show loading state
        document.getElementById('classDetailsContent').innerHTML = `
<div class="loading">
<div class="spinner"></div>
<p>جارٍ تحميل تفاصيل الفصل...</p>
</div>
`;

        const classDoc = await getDoc(doc(db, 'classes', classId));
        if (!classDoc.exists()) {
            document.getElementById('classDetailsContent').innerHTML = `
<div class="empty-state">
    <i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>
    <h3>خطأ</h3>
    <p>لم يتم العثور على الفصل</p>
</div>
`;
            return;
        }

        const classData = classDoc.data();

        // Get students in this class
        const studentsQuery = query(
            collection(db, 'students'),
            where('classId', '==', classId)
        );

        const studentsSnap = await getDocs(studentsQuery);

        // Get teachers assigned to this class
        const teachersQuery = query(
            collection(db, 'users'),
            where('role', '==', 'teacher'),
            where('classes', 'array-contains', classId)
        );

        const teachersSnap = await getDocs(teachersQuery);

        // Build content
        let html = `
<div class="class-details-container">
<div class="class-summary">
    <h4>معلومات الفصل</h4>
    <div class="detail-row">
        <strong>الاسم:</strong>
        <span>${classData.name || 'غير محدد'}</span>
    </div>
    <div class="detail-row">
        <strong>المرحلة:</strong>
        <span>${classData.grade || 'غير محدد'}</span>
    </div>
    <div class="detail-row">
        <strong>السعة:</strong>
        <span>${classData.capacity || 0} طالب</span>
    </div>
    <div class="detail-row">
        <strong>عدد الطلاب:</strong>
        <span>${studentsSnap.size} طالب</span>
    </div>
    <div class="detail-row">
        <strong>الأماكن المتاحة:</strong>
        <span>${(classData.capacity || 0) - studentsSnap.size} مكان</span>
    </div>
</div>
`;

        // Add teachers section
        html += `
<div class="class-teachers">
    <h4>المعلمون المعينون</h4>
`;

        if (teachersSnap.empty) {
            html += `
    <div class="no-teachers">
        <p>لا يوجد معلمون معينون لهذا الفصل</p>
    </div>
`;
        } else {
            html += '<ul class="teachers-list">';
            teachersSnap.forEach(doc => {
                const teacher = doc.data();
                html += `<li>${teacher.fullName} (${teacher.subject || 'غير محدد'})</li>`;
            });
            html += '</ul>';
        }

        html += `</div>`;

        // Add students section
        html += `
<div class="class-students">
    <h4>الطلاب (${studentsSnap.size})</h4>
`;

        if (studentsSnap.empty) {
            html += `
    <div class="no-students">
        <p>لا يوجد طلاب في هذا الفصل</p>
    </div>
`;
        } else {
            html += '<ul class="students-list">';
            studentsSnap.forEach(doc => {
                const student = doc.data();
                html += `<li>${student.fullName} (${student.studentCode || 'غير محدد'})</li>`;
            });
            html += '</ul>';
        }

        html += `</div>`;

        html += `</div>`;

        document.getElementById('classDetailsContent').innerHTML = html;

        // Show the modal
        document.getElementById('viewClassDetailsModal').style.display = 'block';

    } catch (error) {
        FirebaseHelpers.logError('View Class Details', error);
        document.getElementById('classDetailsContent').innerHTML = `
<div class="empty-state">
<i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>
<h3>حدث خطأ</h3>
<p>فشل تحميل تفاصيل الفصل</p>
</div>
`;
    }
};

window.toggleStatus = toggleStatus;
window.confirmDelete = confirmDelete;
window.scrollToSection = scrollToSection;

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

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const userStr = sessionStorage.getItem('currentUser');
        if (userStr) {
            const user = JSON.parse(userStr);
            console.log('Initializing Manager Dashboard for:', user.email);

            // Load initial data
            await loadUserData(user.uid);
            loadStats();

            // Start clock
            if (typeof updateDateTime === 'function') {
                updateDateTime();
                setInterval(updateDateTime, 1000);
            }

            // Verify access
            /* checkAccess is handled by dashboardGuard.js which runs on load 
               but we can double check or just rely on it */

        } else {
            // Should be handled by dashboardGuard, but fallback:
            // window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Initialization error:', error);
    }
});

// ===== ATTENDANCE DASHBOARD LOGIC =====

// 1. Load Students Attendance View (Updated for Filtering)
window.loadStudentsAttendanceView = async function () {
    console.log('Loading Students Attendance View...');

    // Set default date to today if empty
    const dateInput = document.getElementById('studentsAttendanceDate');
    if (!dateInput.value) {
        dateInput.valueAsDate = new Date();
    }

    const classSelect = document.getElementById('studentsAttendanceClassSelect');


    const selectedDate = dateInput.value;
    const selectedClassId = classSelect.value;
    const selectedStudentId = document.getElementById('studentsAttendanceStudentSelect').value;

    const tableContent = document.getElementById('studentsAttendanceTableContent');
    const statsSummary = document.getElementById('attendanceStatsSummary');

    if (!selectedClassId) {
        tableContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-chalkboard-teacher" style="font-size: 48px; color: #cbd5e0; margin-bottom: 15px;"></i>
                <h3>الرجاء اختيار الفصل</h3>
            </div>`;
        statsSummary.style.display = 'none';
        return;
    }

    tableContent.innerHTML = '<div class="loading"><div class="spinner"></div><p>جارٍ تحميل البيانات...</p></div>';
    statsSummary.style.display = 'none';

    try {
        // Mode 1: Individual Student History
        if (selectedStudentId) {
            console.log(`Fetching history for student ${selectedStudentId}`);

            let qAttendance;
            if (selectedDate) {
                const startOfMonth = new Date(selectedDate);
                startOfMonth.setDate(1);
                startOfMonth.setHours(0, 0, 0, 0);
                const endOfMonth = new Date(startOfMonth);
                endOfMonth.setMonth(startOfMonth.getMonth() + 1);
                endOfMonth.setDate(0);
                endOfMonth.setHours(23, 59, 59, 999);

                qAttendance = query(
                    collection(db, 'attendance'),
                    where('studentId', '==', selectedStudentId),
                    where('timestamp', '>=', startOfMonth),
                    where('timestamp', '<=', endOfMonth),
                    orderBy('timestamp', 'desc')
                );
            } else {
                qAttendance = query(
                    collection(db, 'attendance'),
                    where('studentId', '==', selectedStudentId),
                    orderBy('timestamp', 'desc'),
                    limit(50)
                );
            }

            const attendanceSnap = await getDocs(qAttendance);

            let html = `
                <div style="margin-bottom:15px; font-weight:bold; color:#2c3e50;">
                    ${selectedDate ? 'سجل الحضور لشهر ' + new Date(selectedDate).toLocaleDateString('ar-EG', { month: 'long' }) : 'آخر 50 سجل حضور'}
                </div>
                <table class="attendance-log-table">
                    <thead>
                        <tr>
                            <th>التاريخ</th>
                            <th>الوقت</th>
                            <th>الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if (attendanceSnap.empty) {
                html += `<tr><td colspan="3" style="text-align:center;">لا توجد سجلات حضور مسجلة</td></tr>`;
            } else {
                attendanceSnap.forEach(doc => {
                    const data = doc.data();
                    const dateObj = data.timestamp ? data.timestamp.toDate() : null;
                    if (dateObj) {
                        html += `
                            <tr>
                                <td>${dateObj.toLocaleDateString('ar-EG')}</td>
                                <td>${dateObj.toLocaleTimeString('ar-EG')}</td>
                                <td><span class="status-badge status-active">حاضر</span></td>
                            </tr>
                        `;
                    }
                });
            }
            html += '</tbody></table>';
            tableContent.innerHTML = html;
            return;
        }

        // Mode 2: Whole Class Daily View (Existing Logic)
        console.log(`Fetching students for class: ${selectedClassId}`);
        const qStudents = query(collection(db, 'students'), where('classId', '==', selectedClassId));
        const studentsSnap = await getDocs(qStudents);

        console.log(`Found ${studentsSnap.size} students`);

        if (studentsSnap.empty) {
            tableContent.innerHTML = '<div class="empty-state"><p>لا يوجد طلاب في هذا الفصل</p></div>';
            return;
        }

        const students = [];
        studentsSnap.forEach(doc => {
            students.push({ id: doc.id, ...doc.data() });
        });

        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        console.log(`Fetching attendance from ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

        const qAttendance = query(
            collection(db, 'attendance'),
            where('timestamp', '>=', startOfDay),
            where('timestamp', '<=', endOfDay)
        );

        const attendanceSnap = await getDocs(qAttendance);
        console.log(`Found ${attendanceSnap.size} attendance records`);

        const attendanceMap = {}; // studentId -> status

        attendanceSnap.forEach(doc => {
            const data = doc.data();
            if (data.studentId) {
                attendanceMap[data.studentId] = {
                    status: data.status || 'Present',
                    time: data.timestamp ? data.timestamp.toDate().toLocaleTimeString('ar-EG') : '-'
                };
            }
        });

        // 3. Merge and Display
        let html = `
            <table class="attendance-log-table">
                <thead>
                    <tr>
                        <th>الاسم</th>
                        <th>الحالة</th>
                        <th>وقت الحضور</th>
                    </tr>
                </thead>
                <tbody>
        `;

        let presentCount = 0;
        let absentCount = 0;
        let lateCount = 0;

        students.forEach(student => {
            const record = attendanceMap[student.id];
            let statusBadge = '';
            let timeText = '-';

            if (record) {
                // Present
                statusBadge = '<span class="status-badge status-active">حاضر</span>';
                timeText = record.time;
                presentCount++;
            } else {
                // Absent
                statusBadge = '<span class="status-badge status-inactive">غائب</span>';
                absentCount++;
            }

            html += `
                <tr>
                    <td>${student.fullName}</td>
                    <td>${statusBadge}</td>
                    <td>${timeText}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        tableContent.innerHTML = html;

        // Update stats
        document.getElementById('statPresent').textContent = presentCount;
        document.getElementById('statAbsent').textContent = absentCount;
        document.getElementById('statLate').textContent = lateCount; // Logic for late can be added later
        statsSummary.style.display = 'grid';

    } catch (error) {
        console.error('Error loading students attendance:', error);
        tableContent.innerHTML = '<div class="empty-state" style="color:red"><p>حدث خطأ في تحميل البيانات</p></div>';
    }
};

// Helper: Populate Student Select based on Class
window.populateStudentSelect = async function (classId) {
    const studentSelect = document.getElementById('studentsAttendanceStudentSelect');
    if (!classId) {
        studentSelect.innerHTML = '<option value="">الكل</option>';
        studentSelect.disabled = true;
        return;
    }

    studentSelect.disabled = false;
    studentSelect.innerHTML = '<option value="">جارٍ التحميل...</option>';

    try {
        console.log(`Fetching students for class ${classId}...`);
        // Query the students collection directly
        const q = query(collection(db, 'students'), where('classId', '==', classId));
        const snap = await getDocs(q);

        console.log(`Found ${snap.size} students in class`);

        if (snap.empty) {
            studentSelect.innerHTML = '<option value="">لا يوجد طلاب</option>';
            return;
        }

        studentSelect.innerHTML = '<option value="">الكل (عرض يومي)</option>';
        snap.forEach(doc => {
            const student = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = student.fullName || student.name || 'طالب مجهول';
            studentSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading students for select:', error);
        studentSelect.innerHTML = '<option value="">خطأ في التحميل</option>';
    }
};

// 2. Load Teachers Attendance View (Updated for Filtering)
window.loadTeachersAttendanceView = async function () {
    console.log('Loading Teachers Attendance View...');

    // Populate teacher select (Force refresh)
    const teacherSelect = document.getElementById('teachersAttendanceTeacherSelect');


    const dateInput = document.getElementById('teachersAttendanceDate');
    if (!dateInput.value) {
        dateInput.valueAsDate = new Date();
    }

    const selectedDate = dateInput.value;
    const selectedTeacherId = teacherSelect.value;
    const tableContent = document.getElementById('teachersAttendanceTableContent');

    tableContent.innerHTML = '<div class="loading"><div class="spinner"></div><p>جارٍ تحميل بيانات المعلمين...</p></div>';

    try {
        // Mode 1: Individual Teacher History (Full History)
        if (selectedTeacherId) {
            console.log(`Fetching full history for teacher ${selectedTeacherId}`);

            let qAttendance;
            if (selectedDate) {
                // If date selected, look for that specific month's history
                const startOfMonth = new Date(selectedDate);
                startOfMonth.setDate(1);
                startOfMonth.setHours(0, 0, 0, 0);
                const endOfMonth = new Date(startOfMonth);
                endOfMonth.setMonth(startOfMonth.getMonth() + 1);
                endOfMonth.setDate(0);
                endOfMonth.setHours(23, 59, 59, 999);

                qAttendance = query(
                    collection(db, 'attendance'),
                    where('studentId', '==', selectedTeacherId),
                    where('timestamp', '>=', startOfMonth),
                    where('timestamp', '<=', endOfMonth),
                    orderBy('timestamp', 'desc')
                );
            } else {
                // No date selected -> get last 50 records
                qAttendance = query(
                    collection(db, 'attendance'),
                    where('studentId', '==', selectedTeacherId),
                    orderBy('timestamp', 'desc'),
                    limit(50)
                );
            }

            const attendanceSnap = await getDocs(qAttendance);

            let html = `
                <div style="margin-bottom:15px; font-weight:bold; color:#2c3e50;">
                    ${selectedDate ? 'تاريخ الحضور لشهر ' + new Date(selectedDate).toLocaleDateString('ar-EG', { month: 'long' }) : 'آخر 50 سجل حضور'}
                </div>
                <table class="attendance-log-table">
                    <thead>
                        <tr>
                            <th>التاريخ</th>
                            <th>الوقت</th>
                            <th>الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if (attendanceSnap.empty) {
                html += `<tr><td colspan="3" style="text-align:center;">لا توجد سجلات حضور مسجلة</td></tr>`;
            } else {
                attendanceSnap.forEach(doc => {
                    const data = doc.data();
                    const dateObj = data.timestamp ? data.timestamp.toDate() : null;
                    if (dateObj) {
                        html += `
                            <tr>
                                <td>${dateObj.toLocaleDateString('ar-EG')}</td>
                                <td>${dateObj.toLocaleTimeString('ar-EG')}</td>
                                <td><span class="status-badge status-active">حاضر</span></td>
                            </tr>
                        `;
                    }
                });
            }
            html += '</tbody></table>';
            tableContent.innerHTML = html;
            return;
        }

        // Mode 2: All Teachers for Specific Day (Existing Logic)
        console.log('Fetching all teachers for daily view...');
        const qTeachers = query(collection(db, 'users'), where('role', '==', 'teacher'));
        const teachersSnap = await getDocs(qTeachers);

        console.log(`Found ${teachersSnap.size} teachers`);

        if (teachersSnap.empty) {
            tableContent.innerHTML = '<div class="empty-state"><p>لا يوجد معلمين في النظام</p></div>';
            return;
        }

        const teachers = [];
        teachersSnap.forEach(doc => {
            teachers.push({ id: doc.id, ...doc.data() });
        });

        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        console.log(`Fetching teacher attendance from ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

        const qAttendance = query(
            collection(db, 'attendance'),
            where('timestamp', '>=', startOfDay),
            where('timestamp', '<=', endOfDay)
        );

        const attendanceSnap = await getDocs(qAttendance);
        console.log(`Found ${attendanceSnap.size} attendance records`);
        const attendanceMap = {};

        attendanceSnap.forEach(doc => {
            const data = doc.data();
            if (data.studentId) {
                attendanceMap[data.studentId] = {
                    status: data.status || 'Present',
                    time: data.timestamp ? data.timestamp.toDate().toLocaleTimeString('ar-EG') : '-'
                };
            }
        });

        let html = `
            <table class="attendance-log-table">
                <thead>
                    <tr>
                        <th>الاسم</th>
                        <th>التخصص</th>
                        <th>الحالة</th>
                        <th>وقت الحضور</th>
                    </tr>
                </thead>
                <tbody>
        `;

        teachers.forEach(teacher => {
            const record = attendanceMap[teacher.id];
            let statusBadge = '';
            let timeText = '-';

            if (record) {
                statusBadge = '<span class="status-badge status-active">حاضر</span>';
                timeText = record.time;
            } else {
                statusBadge = '<span class="status-badge status-inactive">غائب</span>';
            }

            html += `
                <tr>
                    <td>${teacher.fullName}</td>
                    <td>${teacher.subject || '-'}</td>
                    <td>${statusBadge}</td>
                    <td>${timeText}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        tableContent.innerHTML = html;

    } catch (error) {
        console.error('Error loading teachers attendance:', error);
        tableContent.innerHTML = '<div class="empty-state" style="color:red"><p>حدث خطأ في تحميل البيانات</p></div>';
    }
};

// Helper: Populate Teacher Select
window.populateTeacherSelect = async function (selectElement) {
    if (!selectElement) return;
    // Don't re-populate if already has options (to avoid losing selection)
    if (selectElement.options.length > 1) {
        console.log('Teacher select already populated, skipping...');
        return;
    }
    console.log('Populating Teacher Select...');
    console.trace('populateTeacherSelect trace:');

    try {
        const q = query(collection(db, 'users'), where('role', 'in', ['teacher', 'Teacher']));
        const querySnapshot = await getDocs(q);
        console.log(`Found ${querySnapshot.size} teachers for dropdown`);

        selectElement.innerHTML = '<option value="">كل المعلمين</option>';
        querySnapshot.forEach((doc) => {
            const teacher = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = teacher.fullName || teacher.name || 'معلم مجهول';
            selectElement.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading teachers:', error);
    }
}

// Helper: Populate Class Select
window.populateClassSelect = async function (selectElement) {
    if (!selectElement) return;
    // Don't re-populate if already has options (to avoid losing selection)
    if (selectElement.options.length > 1) {
        console.log('Class select already populated, skipping...');
        return;
    }
    console.log('Populating Class Select...');
    console.trace('populateClassSelect trace:');

    try {
        const q = query(collection(db, 'classes'));
        const querySnapshot = await getDocs(q);
        selectElement.innerHTML = '<option value="">اختر الفصل</option>';
        querySnapshot.forEach((doc) => {
            const classData = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = classData.name || classData.className || 'Unnamed Class';
            selectElement.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading classes:', error);
    }
}



