// js/parentAuth.js

export async function initParentAuth() {
    const parentLoginForm = document.getElementById('parentLoginForm');
    const parentLoginError = document.getElementById('parentLoginError');

    if (!parentLoginForm) {
        console.error('Parent login form not found');
        return;
    }

    // Remove any existing submit listeners by cloning
    const newForm = parentLoginForm.cloneNode(true);
    parentLoginForm.parentNode.replaceChild(newForm, parentLoginForm);

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Get fresh references after cloning
        const studentCodeInput = document.getElementById('parentStudentCode');
        const submitBtn = newForm.querySelector('button[type="submit"]');
        const errorDiv = document.getElementById('parentLoginError');

        if (!studentCodeInput) {
            console.error('Student code input not found');
            return;
        }

        const studentCode = studentCodeInput.value.trim();
        if (!studentCode) {
            if (errorDiv) {
                errorDiv.textContent = 'يرجى إدخال كود الطالب';
                errorDiv.style.display = 'block';
            }
            return;
        }

        try {
            // Show loading
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق...';
            }
            if (errorDiv) {
                errorDiv.style.display = 'none';
            }

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
            if (errorDiv) {
                errorDiv.textContent = error.message === 'Failed to fetch dynamically imported module'
                    ? 'مشكلة في الاتصال بالخادم. يرجى المحاولة لاحقاً.'
                    : error.message;
                errorDiv.style.display = 'block';
            }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'دخول اللوحة <i class="fas fa-sign-in-alt"></i>';
            }
        }
    });

    console.log('✅ Parent auth initialized successfully');
}
