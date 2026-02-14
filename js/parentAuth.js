// js/parentAuth.js

document.addEventListener('DOMContentLoaded', () => {
    const parentLoginForm = document.getElementById('parentLoginForm');
    const parentLoginError = document.getElementById('parentLoginError');

    if (parentLoginForm) {
        parentLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const studentCode = document.getElementById('parentStudentCode').value.trim();
            const submitBtn = parentLoginForm.querySelector('button');

            if (!studentCode) return;

            try {
                // Show loading
                submitBtn.disabled = true;
                const originalBtnText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق...';
                parentLoginError.style.display = 'none';

                // Lazy load Firebase dependencies
                const { db } = await import('./firebaseConfig.js');
                const {
                    collection,
                    query,
                    where,
                    getDocs,
                    limit
                } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");

                // Look for student with this code
                const q = query(
                    collection(db, 'students'),
                    where('studentCode', '==', studentCode),
                    limit(1)
                );

                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    throw new Error('كود الطالب غير صحيح. يرجى التأكد من الكود والمحاولة مرة أخرى.');
                }

                const studentData = snapshot.docs[0].data();
                const studentId = snapshot.docs[0].id;

                // Success! Store session
                sessionStorage.setItem('currentUser', JSON.stringify({
                    uid: studentId,
                    studentCode: studentData.studentCode,
                    fullName: studentData.fullName,
                    role: 'parent',
                    studentId: studentId,
                    classId: studentData.classId,
                    timestamp: Date.now()
                }));

                // Redirect to Parent Dashboard
                window.location.href = 'parent_dashboard.html';

            } catch (error) {
                console.error('Parent Login Error:', error);
                parentLoginError.textContent = error.message === 'Failed to fetch dynamically imported module'
                    ? 'مشكلة في الاتصال بالخادم. يرجى المحاولة لاحقاً.'
                    : error.message;
                parentLoginError.style.display = 'block';
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'دخول اللوحة <i class="fas fa-sign-in-alt"></i>';
            }
        });
    }
});
