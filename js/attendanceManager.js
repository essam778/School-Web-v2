// js/attendanceManager.js - Attendance management system
import { FirebaseHelpers } from './firebaseConfig.js';
import { showQRScannerModal } from './qrScanner.js';

// Function to handle attendance scanning
async function startAttendanceScanning(teacherId, className) {
    return new Promise((resolve, reject) => {
        showQRScannerModal(
            async (scanData) => {
                // Process successful scan
                try {
                    // Extract student ID from QR code data (supports both formats)
                    const studentId = scanData.studentId || scanData.s;
                    
                    if (!studentId) {
                        FirebaseHelpers.showToast('رمز QR غير صحيح', 'error');
                        reject(new Error('Invalid QR code format'));
                        return;
                    }
                    
                    // Log attendance to Firebase
                    const result = await FirebaseHelpers.logAttendance(
                        studentId,
                        scanData.studentName || `Student ${studentId}`,
                        className,
                        teacherId
                    );
                    
                    if (result.success) {
                        FirebaseHelpers.showToast(`تم تسجيل حضور الطالب ${scanData.studentName || studentId}`, 'success');
                        resolve(result);
                    } else {
                        FirebaseHelpers.showToast('فشل في تسجيل الحضور', 'error');
                        reject(new Error(result.error));
                    }
                } catch (error) {
                    console.error('Error processing attendance:', error);
                    FirebaseHelpers.showToast('حدث خطأ أثناء تسجيل الحضور', 'error');
                    reject(error);
                }
            },
            (error) => {
                // Handle scanner error
                console.error('QR Scanner error:', error);
                FirebaseHelpers.showToast('خطأ في ماسح QR', 'error');
                reject(error);
            }
        );
    });
}

// Function to get attendance logs for a specific date
async function getAttendanceLogs(date = new Date()) {
    try {
        const attendanceRecords = await FirebaseHelpers.getAttendanceByDate(date);
        return attendanceRecords;
    } catch (error) {
        console.error('Error getting attendance logs:', error);
        return [];
    }
}

// Function to get attendance logs for a specific student
async function getStudentAttendance(studentId) {
    try {
        const attendanceRecords = await FirebaseHelpers.getAttendanceByStudent(studentId);
        return attendanceRecords;
    } catch (error) {
        console.error('Error getting student attendance:', error);
        return [];
    }
}

// Function to render attendance logs in a table
function renderAttendanceLogs(attendanceRecords, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with id ${containerId} not found`);
        return;
    }
    
    if (!attendanceRecords || attendanceRecords.length === 0) {
        container.innerHTML = '<p>لا توجد سجلات حضور</p>';
        return;
    }
    
    // Sort by timestamp (newest first)
    const sortedRecords = attendanceRecords.sort((a, b) => 
        b.timestamp && a.timestamp ? 
            (b.timestamp.seconds - a.timestamp.seconds) : 
            0
    );
    
    const tableHTML = `
        <table class="attendance-table">
            <thead>
                <tr>
                    <th>اسم الطالب</th>
                    <th>معرف الطالب</th>
                    <th>الفصل</th>
                    <th>الوقت</th>
                    <th>الحالة</th>
                </tr>
            </thead>
            <tbody>
                ${sortedRecords.map(record => {
                    const timestamp = record.timestamp ? 
                        new Date(record.timestamp.seconds * 1000).toLocaleString('ar-EG') : 
                        new Date(record.date).toLocaleString('ar-EG');
                    return `
                        <tr>
                            <td>${record.studentName || record.studentId}</td>
                            <td>${record.studentId}</td>
                            <td>${record.className}</td>
                            <td>${timestamp}</td>
                            <td><span class="status-badge status-present">${record.status}</span></td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = tableHTML;
}

// Export functions
export {
    startAttendanceScanning,
    getAttendanceLogs,
    getStudentAttendance,
    renderAttendanceLogs
};