// js/firebaseConfig.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { 
    getAuth, 
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { 
    collection, 
    addDoc, 
    doc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    limit,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCSTx_xxEL1gDy8KHZFY7RspufcGOP93rc",
    authDomain: "moral-1f74c.firebaseapp.com",
    databaseURL: "https://moral-1f74c-default-rtdb.firebaseio.com",
    projectId: "moral-1f74c",
    storageBucket: "moral-1f74c.firebasestorage.app",
    messagingSenderId: "499145715364",
    appId: "1:499145715364:web:33808d0524085e35e24031",
    measurementId: "G-0FG02JEW6N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Set persistence to local
setPersistence(auth, browserLocalPersistence)
    .then(() => {
        console.log('✅ Firebase persistence set to LOCAL');
    })
    .catch((error) => {
        console.warn('⚠️ Persistence error:', error);
    });

// Helper functions
const FirebaseHelpers = {
    logError: (context, error) => {
        console.error(`❌ ${context}:`, error.code || error.message || error);
    },
    
    showToast: (message, type = 'info') => {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : '#3498db'};
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            font-weight: 600;
            z-index: 10000;
            animation: slideDown 0.3s ease;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s ease';
            setTimeout(() => toast.remove(), 3000);
        }, 3000);
    },
    
    // Attendance logging functions
    logAttendance: async (studentId, studentName, className, teacherId, date = new Date()) => {
        try {
            const attendanceRef = collection(db, 'attendance');
            const attendanceRecord = {
                studentId,
                studentName,
                className,
                teacherId,
                date: date.toISOString(),
                timestamp: serverTimestamp(),
                status: 'present'
            };
            
            const docRef = await addDoc(attendanceRef, attendanceRecord);
            console.log('Attendance logged successfully:', docRef.id);
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Error logging attendance:', error);
            return { success: false, error: error.message };
        }
    },
    
    getAttendanceByDate: async (date) => {
        try {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            
            const q = query(
                collection(db, 'attendance'),
                where('timestamp', '>=', startDate),
                where('timestamp', '<=', endDate),
                orderBy('timestamp', 'desc')
            );
            
            const querySnapshot = await getDocs(q);
            const attendanceRecords = [];
            querySnapshot.forEach((doc) => {
                attendanceRecords.push({ id: doc.id, ...doc.data() });
            });
            
            return attendanceRecords;
        } catch (error) {
            console.error('Error getting attendance by date:', error);
            return [];
        }
    },
    
    getAttendanceByStudent: async (studentId, limitCount = 100) => {
        try {
            const q = query(
                collection(db, 'attendance'),
                where('studentId', '==', studentId),
                orderBy('timestamp', 'desc'),
                limit(limitCount)
            );
            
            const querySnapshot = await getDocs(q);
            const attendanceRecords = [];
            querySnapshot.forEach((doc) => {
                attendanceRecords.push({ id: doc.id, ...doc.data() });
            });
            
            return attendanceRecords;
        } catch (error) {
            console.error('Error getting attendance by student:', error);
            return [];
        }
    }
};

export { auth, db, FirebaseHelpers };