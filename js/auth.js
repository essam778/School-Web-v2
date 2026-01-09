// js/auth.js - النسخة النهائية بدون Loop
import { auth, db } from './firebaseConfig.js';
import {
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
    doc,
    getDoc,
    getDocs,
    collection,
    query,
    where,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ===== DOM ELEMENTS =====
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('errorMessage');

// ===== FLAGS =====
let isProcessing = false;

// ===== INITIALIZATION =====
if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
    setupPasswordToggle();
    loadRememberedEmail();
    
    // التحقق من حالة المستخدم عند تحميل صفحة التسجيل
    checkAuthStateOnLoginPage();
}

// ===== LOGIN HANDLER =====
async function handleLogin(e) {
    e.preventDefault();
    
    if (isProcessing) return;
    
    const roleElement = document.getElementById('role');
    const emailElement = document.getElementById('email');
    const passwordElement = document.getElementById('password');
    const rememberMeElement = document.getElementById('rememberMe');
    
    const role = roleElement ? roleElement.value : null;
    const email = emailElement ? emailElement.value.trim() : null;
    const password = passwordElement ? passwordElement.value : null;
    const rememberMe = rememberMeElement ? rememberMeElement.checked : false;
    
    // التحقق الأساسي
    if (!role) {
        showError('يرجى اختيار نوع الحساب');
        return;
    }
    
    if (!email || !password) {
        showError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
        return;
    }
    
    if (!validateEmail(email)) {
        showError('البريد الإلكتروني غير صحيح');
        return;
    }
    
    try {
        isProcessing = true;
        showLoading(true);
        hideError();
        
        console.log('🔄 جاري تسجيل الدخول...');
        
        // 1. البحث عن المستخدم في Firestore
        const usersQuery = query(
            collection(db, 'users'),
            where('email', '==', email),
            where('role', '==', role)
        );
        
        const querySnapshot = await getDocs(usersQuery);
        
        if (querySnapshot.empty) {
            throw new Error('لم يتم العثور على حساب بهذا البريد والدور');
        }
        
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        
        // 2. التحقق من كلمة المرور
        if (userData.password !== password) {
            throw new Error('كلمة المرور غير صحيحة');
        }
        
        // 3. التحقق من أن الحساب نشط
        if (userData.isActive === false) {
            throw new Error('الحساب غير نشط');
        }
        
        console.log('✅ تسجيل الدخول ناجح:', userData.fullName);
        
        // 4. حفظ البريد إذا كان "تذكرني" مفعل
        if (rememberMe) {
            localStorage.setItem('rememberedEmail', email);
        } else {
            localStorage.removeItem('rememberedEmail');
        }
        
        // 5. حفظ بيانات الجلسة
        sessionStorage.setItem('currentUser', JSON.stringify({
            uid: userDoc.id,
            email: userData.email,
            fullName: userData.fullName,
            role: userData.role,
            timestamp: Date.now()
        }));
        
        // 6. تحديث وقت الدخول الأخير
        try {
            await updateDoc(doc(db, 'users', userDoc.id), {
                lastLogin: serverTimestamp()
            });
        } catch (e) {
            console.warn('⚠️  ملاحظة: ', e.message);
        }
        
        // 7. التوجيه بناءً على الدور
        redirectToDashboard(userData.role);
        
    } catch (error) {
        console.error('❌ خطأ:', error.message);
        showError(error.message || 'حدث خطأ أثناء تسجيل الدخول');
        showLoading(false);
        isProcessing = false;
    }
}

// ===== REDIRECT FUNCTION =====
function redirectToDashboard(role) {
    const dashboards = {
        'manager': 'manager_dashboard.html',
        'teacher': 'teacher_dashboard.html', 
        'student': 'student_dashboard.html',
        'admin': 'admin_dashboard.html'
    };
    
    const targetPage = dashboards[role] || 'student_dashboard.html';
    console.log('🚀 تحويل إلى:', targetPage);
    
    // استخدام setTimeout لتجنب أي تعارض
    setTimeout(() => {
        window.location.href = targetPage;
    }, 100);
}

// ===== CHECK AUTH ON LOGIN PAGE =====
async function checkAuthStateOnLoginPage() {
    try {
        // Check if user session exists
        const currentUser = sessionStorage.getItem('currentUser');
        
        if (currentUser) {
            const userData = JSON.parse(currentUser);
            console.log('👤 User already logged in:', userData.email);
            
            // Only redirect if we're on the login page
            const isLoginPage = window.location.pathname.includes('index.html') || 
                               window.location.pathname === '/' ||
                               window.location.pathname.endsWith('/');
            
            if (isLoginPage) {
                console.log('🔄 Auto-redirecting to dashboard...');
                redirectToDashboard(userData.role);
            }
        }
    } catch (error) {
        console.log('No user logged in');
    }
}

// ===== HELPER FUNCTIONS =====
function getErrorMessage(errorCode) {
    const messages = {
        'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
        'auth/user-not-found': 'لا يوجد حساب بهذا البريد',
        'auth/wrong-password': 'كلمة المرور غير صحيحة',
        'auth/too-many-requests': 'محاولات كثيرة، حاول لاحقاً',
        'auth/network-request-failed': 'فشل الاتصال بالإنترنت'
    };
    return messages[errorCode] || 'حدث خطأ أثناء تسجيل الدخول';
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function setupPasswordToggle() {
    const toggleBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    
    if (toggleBtn && passwordInput) {
        toggleBtn.addEventListener('click', () => {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            toggleBtn.classList.toggle('fa-eye');
            toggleBtn.classList.toggle('fa-eye-slash');
        });
    }
}

function loadRememberedEmail() {
    const emailInput = document.getElementById('email');
    const rememberCheckbox = document.getElementById('rememberMe');
    
    if (!emailInput) return;
    
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
        emailInput.value = savedEmail;
        if (rememberCheckbox) {
            rememberCheckbox.checked = true;
        }
    }
}

function showLoading(show) {
    if (loadingEl) loadingEl.style.display = show ? 'block' : 'none';
    if (loginBtn) {
        loginBtn.disabled = show;
        loginBtn.innerHTML = show 
            ? '<span>جاري الدخول...</span>' 
            : '<span>تسجيل الدخول</span><i class="fas fa-arrow-left"></i>';
    }
}

function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    setTimeout(() => errorEl.style.display = 'none', 5000);
}

function hideError() {
    if (errorEl) errorEl.style.display = 'none';
}

// ===== GLOBAL LOGOUT =====
window.logoutUser = async function() {
    try {
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    } catch (error) {
        console.error('خطأ في تسجيل الخروج:', error);
        alert('حدث خطأ أثناء تسجيل الخروج');
    }
};

console.log('✅ نظام المصادقة جاهز للعمل');