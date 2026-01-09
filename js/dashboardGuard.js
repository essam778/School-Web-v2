// js/dashboardGuard.js
import { db } from './firebaseConfig.js';
import { 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Prevent multiple checks
let isChecking = false;
let accessGranted = false;

// Check authentication and authorization
async function checkAccess() {
    // Prevent running multiple times
    if (isChecking || accessGranted) {
        return accessGranted;
    }
    
    isChecking = true;
    
    try {
        // Check session storage for user
        const currentUserStr = sessionStorage.getItem('currentUser');
        
        // Redirect to login if not authenticated
        if (!currentUserStr) {
            console.log('❌ No user logged in, redirecting to login');
            window.location.href = 'index.html';
            return false;
        }
        
        const currentUser = JSON.parse(currentUserStr);
        console.log('✅ User authenticated:', currentUser.email);
        
        // Validate stored user data first
        if (!currentUser.uid || !currentUser.email) {
            console.log('❌ Invalid user data in session storage');
            sessionStorage.removeItem('currentUser');
            window.location.href = 'index.html';
            return false;
        }
        
        // Get user data from Firestore to verify
        let userDoc;
        try {
            userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        } catch (firestoreError) {
            // Handle network errors gracefully
            console.warn('⚠️ Firestore connection failed:', firestoreError.message);
            
            // Check if user data is recent enough to trust (within last 5 minutes)
            if (currentUser.timestamp && (Date.now() - currentUser.timestamp) < 5 * 60 * 1000) {
                // User data is recent, allow access based on session data
                console.log('⚠️ Using cached session data due to network issue');
                
                // Validate role from session
                const userRole = currentUser.role;
                if (!userRole) {
                    console.log('❌ No role found in session data');
                    sessionStorage.removeItem('currentUser');
                    window.location.href = 'index.html';
                    return false;
                }
                
                // Check role authorization based on current page
                const currentPage = window.location.pathname.split('/').pop();
                const rolePages = {
                    'admin_dashboard.html': 'admin',
                    'manager_dashboard.html': 'manager',
                    'teacher_dashboard.html': 'teacher',
                    'student_dashboard.html': 'student'
                };
                
                const requiredRole = rolePages[currentPage];
                
                if (requiredRole && userRole !== requiredRole) {
                    console.log(`❌ Role mismatch. Required: ${requiredRole}, User: ${userRole}`);
                    
                    // Redirect to correct dashboard
                    const correctPages = {
                        'admin': 'admin_dashboard.html',
                        'manager': 'manager_dashboard.html',
                        'teacher': 'teacher_dashboard.html',
                        'student': 'student_dashboard.html'
                    };
                    
                    window.location.href = correctPages[userRole] || 'student_dashboard.html';
                    return false;
                }
                
                console.log('✅ Access granted using cached data for role:', userRole);
                accessGranted = true;
                return true;
            } else {
                // Session data is too old, require re-authentication
                console.log('❌ Network unavailable and session data is outdated');
                sessionStorage.removeItem('currentUser');
                window.location.href = 'index.html';
                return false;
            }
        }
        
        if (!userDoc.exists()) {
            console.log('❌ User document not found');
            sessionStorage.removeItem('currentUser');
            window.location.href = 'index.html';
            return false;
        }
        
        const userData = userDoc.data();
        const userRole = userData.role;
        
        // Update session storage with fresh user data
        const updatedUserData = {
            ...currentUser,
            role: userRole,
            timestamp: Date.now()
        };
        sessionStorage.setItem('currentUser', JSON.stringify(updatedUserData));
        
        // Check if account is active
        if (userData.isActive === false) {
            alert('حسابك غير نشط. يرجى التواصل مع الإدارة');
            sessionStorage.removeItem('currentUser');
            window.location.href = 'index.html';
            return false;
        }
        
        // Check role authorization based on current page
        const currentPage = window.location.pathname.split('/').pop();
        const rolePages = {
            'admin_dashboard.html': 'admin',
            'manager_dashboard.html': 'manager',
            'teacher_dashboard.html': 'teacher',
            'student_dashboard.html': 'student'
        };
        
        const requiredRole = rolePages[currentPage];
        
        if (requiredRole && userRole !== requiredRole) {
            console.log(`❌ Role mismatch. Required: ${requiredRole}, User: ${userRole}`);
            
            // Redirect to correct dashboard
            const correctPages = {
                'admin': 'admin_dashboard.html',
                'manager': 'manager_dashboard.html,teacher_dashboard.html',
                'teacher': 'teacher_dashboard.html',
                'student': 'student_dashboard.html'
            };
            
            window.location.href = correctPages[userRole] || 'student_dashboard.html';
            return false;
        }
        
        console.log('✅ Access granted for role:', userRole);
        accessGranted = true;
        return true;
        
    } catch (error) {
        console.error('❌ Access check error:', error);
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
        return false;
    } finally {
        isChecking = false;
    }
}

// Run check on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAccess();
});

export { checkAccess };