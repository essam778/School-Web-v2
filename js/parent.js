// js/parent.js
import { db, FirebaseHelpers } from './firebaseConfig.js';
import {
    doc,
    getDoc,
    collection,
    query,
    where,
    getDocs,
    orderBy,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

let currentStudent = null;
let isLoading = false;

async function init() {
    const sessionUser = sessionStorage.getItem('currentUser');
    if (!sessionUser) {
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(sessionUser);
    if (user.role !== 'parent') {
        window.location.href = 'index.html';
        return;
    }

    try {
        await loadStudentData(user.studentId);
        setupNavigation();

        // Initial data load
        await Promise.all([
            loadSummaryStats(),
            loadGrades(),
            loadAttendance(),
            loadSchedule()
        ]);

    } catch (e) {
        FirebaseHelpers.logError('Init Parent Portal', e);
        FirebaseHelpers.showToast('حدث خطأ في تحميل البيانات الأساسية', 'error');
    }
}

function isCurrentSession(dayId, startTime, endTime) {
    if (!startTime || !endTime) return false;
    const today = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[today.getDay()];
    if (dayId.toLowerCase() !== currentDay) return false;
    const formatTime = (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };
    const now = today.getHours() * 60 + today.getMinutes();
    return now >= formatTime(startTime) && now <= formatTime(endTime);
}

// ===== LOAD ANNOUNCEMENTS =====
async function loadAnnouncements() {
    const container = document.getElementById('announcementsContainer');
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const q = query(
            collection(db, 'announcements'),
            where('target', 'in', ['all', 'parents'])
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bullhorn" style="opacity: 0.2; font-size: 50px; color: var(--text-muted);"></i>
                    <p style="color: var(--text-muted);">لا توجد إعلانات حالياً.</p>
                </div>`;
            return;
        }

        // Client-side sorting
        const docs = snapshot.docs.sort((a, b) => {
            const timeA = a.data().timestamp?.toMillis() || 0;
            const timeB = b.data().timestamp?.toMillis() || 0;
            return timeB - timeA;
        });

        let html = '<div style="display: grid; gap: 20px;">';
        docs.forEach(doc => {
            const ann = doc.data();
            const time = ann.timestamp ? ann.timestamp.toDate().toLocaleString('ar-EG') : 'الآن';
            html += `
                <div style="background: var(--card-bg); padding: 30px; border-radius: 20px; border-right: 5px solid var(--accent); box-shadow: 0 10px 30px rgba(0,0,0,0.2); border: 1px solid var(--glass-border);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                        <h3 style="margin: 0; color: var(--text-main); font-size: 20px;">${ann.title}</h3>
                        <span style="font-size: 13px; color: var(--text-muted); background: var(--glass); padding: 5px 12px; border-radius: 20px;"><i class="fas fa-clock"></i> ${time}</span>
                    </div>
                    <p style="color: var(--text-main); opacity: 0.9; line-height: 1.8; margin: 0; font-size: 15px;">${ann.body || ann.content || ''}</p>
                </div>`;
        });
        html += '</div>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Announcements Error:', error);
        container.innerHTML = '<p style="text-align: center; color: var(--danger); padding: 20px;">فشل تحميل الإعلانات.</p>';
    }
}

async function loadStudentData(studentId) {
    const studentDoc = await getDoc(doc(db, 'students', studentId));
    if (studentDoc.exists()) {
        currentStudent = { id: studentDoc.id, ...studentDoc.data() };
        updateHeaderUI();
    }
}

function updateHeaderUI() {
    if (!currentStudent) return;
    document.getElementById('studentDisplayName').textContent = currentStudent.fullName;
    document.getElementById('studentCodeDisplay').textContent = currentStudent.studentCode;
    document.getElementById('studentInitial').textContent = currentStudent.fullName.charAt(0);
}

function setupNavigation() {
    window.showSection = (sectionId) => {
        const sections = ['summarySection', 'gradesSection', 'attendanceSection', 'scheduleSection', 'lmsSection', 'announcementsSection'];
        sections.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = 'none';
                el.classList.remove('active'); // Keep active class removal for consistency if needed elsewhere
            }
        });

        const target = document.getElementById(sectionId);
        if (target) {
            target.style.display = 'block';
            target.classList.add('active');
        }

        // Update sidebar links
        document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
        const activeLink = document.querySelector(`a[onclick*="${sectionId}"]`);
        if (activeLink) activeLink.classList.add('active');

        if (sectionId === 'announcementsSection') {
            loadAnnouncements();
        }
    };

    window.logoutUser = () => {
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    };
}

async function loadSummaryStats() {
    // 1. Calculate Average from Grades
    try {
        const q = query(collection(db, 'grades'), where('studentId', '==', currentStudent.id));
        const snapshot = await getDocs(q);
        let total = 0;
        let count = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.score && data.maxScore) {
                total += (data.score / data.maxScore) * 100;
                count++;
            }
        });
        const avg = count > 0 ? Math.round(total / count) : 0;
        document.getElementById('overallAverage').textContent = avg + '%';
    } catch (err) { console.error('Stats Error:', err); }

    // 2. Attendance Rate
    try {
        const q = query(collection(db, 'attendance'), where('studentId', '==', currentStudent.id));
        const snapshot = await getDocs(q);
        const totalDays = snapshot.size;
        const presents = snapshot.docs.filter(d => d.data().status === 'present').length;
        const rate = totalDays > 0 ? Math.round((presents / totalDays) * 100) : 100; // Default 100 if no data
        document.getElementById('attendanceRate').textContent = rate + '%';
    } catch (err) { console.error('Stats Error:', err); }
}

async function loadGrades() {
    const container = document.getElementById('fullGradesList');
    const recentLegacy = document.getElementById('recentGradesLegacy');
    if (!container) return;

    try {
        const q = query(
            collection(db, 'grades'),
            where('studentId', '==', currentStudent.id)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<p style="opacity: 0.5; text-align: center;">لا توجد درجات مسجلة حالياً.</p>';
            recentLegacy.innerHTML = '<p style="opacity: 0.5; text-align: center;">لا توجد نتائج حديثة.</p>';
            return;
        }

        // Sort client-side
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

        let html = '<table style="width: 100%; border-collapse: collapse; margin-top: 10px;">';
        html += '<tr style="border-bottom: 2px solid var(--glass-border); text-align: right; opacity: 0.7;">';
        html += '<th style="padding: 15px;">المادة</th><th style="padding: 15px;">الدرجة</th><th style="padding: 15px;">الدرجة النهائية</th><th style="padding: 15px;">التاريخ</th></tr>';

        items.forEach(grade => {
            const date = grade.timestamp ? grade.timestamp.toDate().toLocaleDateString('ar-EG') : '-';
            html += `<tr style="border-bottom: 1px solid var(--glass-border);">
                <td style="padding: 15px; font-weight: 600;">${grade.subjectName || 'مادة'}</td>
                <td style="padding: 15px; color: var(--success); font-weight: 700;">${grade.score}</td>
                <td style="padding: 15px; opacity: 0.6;">${grade.maxScore}</td>
                <td style="padding: 15px; font-size: 13px; opacity: 0.5;">${date}</td>
            </tr>`;
        });
        html += '</table>';
        container.innerHTML = html;
        recentLegacy.innerHTML = html;
    } catch (err) {
        console.error('Grades Error:', err);
        container.innerHTML = '<p style="text-align: center; color: var(--danger);">خطأ في تحميل الدرجات</p>';
    }
}

async function loadAttendance() {
    const container = document.getElementById('fullAttendanceList');
    if (!container) return;

    try {
        const q = query(
            collection(db, 'attendance'),
            where('studentId', '==', currentStudent.id)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<p style="opacity: 0.5; text-align: center;">سجل الحضور نظيف.</p>';
            return;
        }

        // Sort client-side
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        let html = '<div style="display: grid; gap: 10px;">';
        items.forEach(att => {
            const statusLabel = att.status === 'present' ? 'حاضر' : (att.status === 'absent' ? 'غائب' : 'متأخر');
            const color = att.status === 'present' ? 'var(--success)' : (att.status === 'absent' ? 'var(--danger)' : 'var(--warning)');

            html += `<div style="display: flex; justify-content: space-between; padding: 15px; background: rgba(255,255,255,0.02); border-radius: 12px; border-right: 4px solid ${color};">
                <span>${att.date}</span>
                <span style="font-weight: 700; color: ${color};">${statusLabel}</span>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (err) {
        console.error('Attendance Error:', err);
        container.innerHTML = '<p style="text-align: center; color: var(--danger);">خطأ في تحميل حضور اليوم</p>';
    }
}

async function loadSchedule() {
    const container = document.getElementById('parentScheduleGrid');
    if (!container || !currentStudent.classId) return;

    try {
        const q = query(
            collection(db, 'schedule'),
            where('classId', '==', currentStudent.classId)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<p style="opacity: 0.4; grid-column: 1/-1; text-align: center;">جدول الحصص غير متاح حالياً.</p>';
            return;
        }

        // Group by day and sort client-side
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
        const dayArabic = { sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };

        const allSessions = snapshot.docs.map(doc => doc.data())
            .sort((a, b) => a.sessionOrder - b.sessionOrder);

        let html = '';
        days.forEach(day => {
            const daySessions = allSessions.filter(s => s.day === day);
            if (daySessions.length > 0) {
                html += `<div style="grid-column: 1/-1; margin-top: 20px; border-bottom: 1px solid var(--glass-border); padding-bottom: 5px; color: var(--primary-light); font-weight: 800;">${dayArabic[day]}</div>`;
                daySessions.forEach(s => {
                    const current = isCurrentSession(day, s.startTime, s.endTime);
                    const highlightStyle = current ? 'border: 2px solid #8b5cf6; background: rgba(139, 92, 246, 0.1);' : '';

                    html += `
                        <div class="session-card" style="${highlightStyle}">
                            <div class="session-time">${s.startTime} - ${s.endTime} ${current ? '<span style="color:#a78bfa; font-size:10px;">(الآن)</span>' : ''}</div>
                            <div class="session-subject" style="font-weight:700;">${s.subjectName}</div>
                            <div class="session-teacher" style="font-size:11px; opacity:0.7;">${s.teacherName || ''}</div>
                        </div>`;
                });
            }
        });
        container.innerHTML = html;
    } catch (err) {
        console.error('Schedule Error:', err);
    }
}

async function loadAssignments() {
    const container = document.getElementById('assignmentsList');
    if (!container || !currentStudent.classId) return;

    try {
        const q = query(
            collection(db, 'assignments'),
            where('classId', '==', currentStudent.classId)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<p style="opacity: 0.5; text-align: center;">لا توجد واجبات حالياً.</p>';
            return;
        }

        // Sort client-side
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

        let html = '<div style="display: grid; gap: 15px;">';
        items.forEach(item => {
            html += `<div style="background: rgba(255,255,255,0.02); padding: 20px; border-radius: 16px; border: 1px solid var(--glass-border);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="color: var(--primary-light);">${item.title}</h4>
                    <span style="font-size: 12px; color: var(--danger); font-weight: 800;">تسليم: ${item.deadline}</span>
                </div>
                <p style="font-size: 14px; opacity: 0.7; line-height: 1.5;">${item.description}</p>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;

        // Update pending count
        document.getElementById('pendingAssignments').textContent = snapshot.size;
    } catch (err) { console.error('LMS Error:', err); }
}

async function loadMaterials() {
    const container = document.getElementById('materialsList');
    if (!container || !currentStudent.classId) return;

    try {
        const q = query(
            collection(db, 'materials'),
            where('classId', '==', currentStudent.classId)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<p style="opacity: 0.5; text-align: center;">لا توجد مواد تعليمية بعد.</p>';
            return;
        }

        // Sort client-side
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

        let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px;">';
        items.forEach(item => {
            html += `<div style="background: rgba(255,255,255,0.02); padding: 15px; border-radius: 16px; border: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600;">${item.title}</span>
                <a href="${item.url}" target="_blank" style="color: var(--success); font-size: 18px;"><i class="fas fa-external-link-alt"></i></a>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (err) { console.error('Materials Error:', err); }
}

// Gemini AI Report Integration
async function checkAIReport() {
    const banner = document.getElementById('aiReportBanner');
    if (!banner) return;

    // We can simulate a logic where if student has > 3 grades, we show the banner
    const gradesQ = query(collection(db, 'grades'), where('studentId', '==', currentStudent.id));
    const gradesSnap = await getDocs(gradesQ);

    if (gradesSnap.size >= 1) {
        banner.style.display = 'block';
        banner.onclick = () => showAIReport(gradesSnap);
    }
}

async function showAIReport(gradesSnap) {
    const modal = document.getElementById('aiReportModal');
    const content = document.getElementById('aiReportContent');
    if (!modal || !content) return;

    FirebaseHelpers.showToast('جاري تحليل البيانات بواسطة الذكاء الاصطناعي...', 'info');

    // Construct prompt
    let gradesText = "";
    gradesSnap.forEach(doc => {
        const g = doc.data();
        gradesText += `${g.subjectName}: ${g.score}/${g.maxScore}. `;
    });

    try {
        // Simulated AI response
        const report = `بناءً على النتائج الأخيرة، يظهر الطالب تميزاً ملحوظاً في المواد العلمية بمتوسط عالٍ. نشيد بالتزامه وننصح بالتركيز الإضافي على مهارات التطبيق العملي لتعزيز الفهم الشامل. أداؤه العام يدعو للفخر والتفاؤل بمستقبل باهر.`;

        content.innerHTML = `
            <div style="font-size: 1.1rem; line-height: 1.8; color: var(--light);">
                <i class="fas fa-quote-right" style="font-size: 2rem; opacity: 0.1; position: absolute; top: 20px; right: 20px;"></i>
                ${report}
            </div>
        `;
        modal.classList.add('active');
    } catch (err) {
        console.error('AI Error:', err);
        FirebaseHelpers.showToast('فشل تحليل البيانات', 'error');
    }
}

window.closeAIModal = () => {
    document.getElementById('aiReportModal').classList.remove('active');
};

// Initial Run
init().then(() => {
    loadAssignments();
    loadMaterials();
    checkAIReport();
});
