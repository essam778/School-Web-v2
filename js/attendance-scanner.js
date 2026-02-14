
import { db } from './firebaseConfig.js';
import {
    collection,
    addDoc,
    serverTimestamp,
    doc,
    getDoc,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Global scanner instance
let html5QrcodeScanner = null;
let isScanning = false;

// DOM Elements (will be set on init)
let resultCard, statusIcon, statusMessage, studentNameEl, scanTimeEl;

// State
let lastScannedId = null;
let lastScanTime = 0;
const SCAN_COOLDOWN = 3000;
const SAME_CARD_COOLDOWN = 10000;

/**
 * Initialize the scanner in a specific container
 * @param {string} elementId - The ID of the HTML element to render the scanner in
 */
export function initScanner(elementId) {
    if (html5QrcodeScanner) {
        console.warn("Scanner already initialized.");
        return;
    }

    console.log("Initializing QR Scanner on element:", elementId);

    // Ensure the element exists first
    const element = document.getElementById(elementId);
    if (!element) {
        console.error('Scanner container element not found:', elementId);
        return;
    }

    // Check if Html5QrcodeScanner is available with exponential backoff
    const maxAttempts = 50; // Increased max attempts
    let attempts = 0;

    function checkAndInit() {
        attempts++;

        if (typeof window.Html5QrcodeScanner !== 'undefined') {
            // Library loaded successfully
            console.log('Html5QrcodeScanner library loaded on attempt:', attempts);
            initializeScannerNow(elementId);
        } else if (attempts < maxAttempts) {
            // Keep trying with exponential backoff (up to 500ms)
            const delay = Math.min(100 + (attempts * 50), 1000);
            // console.log(`Attempt ${attempts}/${maxAttempts} - retrying in ${delay}ms`);
            setTimeout(checkAndInit, delay);
        } else {
            // Give up after max attempts and show manual retry
            console.error('Html5QrcodeScanner library failed to load after multiple attempts');
            element.innerHTML = `
                <div style="background: white; color: #e74c3c; text-align: center; padding: 30px 20px; border-radius: 10px; border: 2px dashed #e74c3c;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
                    <h3 style="margin-bottom: 10px;">فشل تحميل الكاميرا</h3>
                    <p style="margin-bottom: 15px;">لم نتمكن من تحميل مكتبة المسح. يرجى التحقق من الاتصال بالإنترنت.</p>
                    <button onclick="window.location.reload()" style="background: #e74c3c; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">
                        <i class="fas fa-sync"></i> تحديث الصفحة
                    </button>
                </div>`;
        }
    }

    checkAndInit();
}

function initializeScannerNow(elementId) {
    // Initialize DOM elements relative to the document
    resultCard = document.getElementById('result-card');
    statusIcon = document.getElementById('status-icon');
    statusMessage = document.getElementById('status-message');
    studentNameEl = document.getElementById('student-name');
    scanTimeEl = document.getElementById('scan-time');

    try {
        // Clear previous instance content if any
        document.getElementById(elementId).innerHTML = '';

        html5QrcodeScanner = new window.Html5QrcodeScanner(
            elementId,
            {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0,
                showTorchButtonIfSupported: true,
                rememberLastUsedCamera: true
            },
            false // verbose
        );

        // Render without error catching as it returns void
        html5QrcodeScanner.render(onScanSuccess, onScanFailure);

        isScanning = true;
        console.log("QR Scanner initialized successfully!");
    } catch (error) {
        console.error("Error initializing scanner:", error);
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `<div style="color: red; padding: 20px;">Error: ${error.message}</div>`;
        }
    }
}

/**
 * Stop the scanner and clear the instance
 */
export async function stopScanner() {
    if (html5QrcodeScanner) {
        try {
            await html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
            isScanning = false;
            console.log("QR Scanner stopped.");
        } catch (error) {
            console.warn("Scanner stop/clear warning:", error);
            // Force clean up
            html5QrcodeScanner = null;
            isScanning = false;
        }
    }
}



function onScanSuccess(decodedText, decodedResult) {
    const currentTime = Date.now();

    if (decodedText === lastScannedId) {
        if (currentTime - lastScanTime < SAME_CARD_COOLDOWN) return;
    } else {
        if (currentTime - lastScanTime < SCAN_COOLDOWN) return;
    }

    lastScannedId = decodedText;
    lastScanTime = currentTime;

    handleAttendance(decodedText);
}

function onScanFailure(error) {
    // console.warn(`Code scan error = ${error}`);
}

// Attendance Logic
async function handleAttendance(studentUid) {
    try {
        if (resultCard) showProcessingState();

        const cleanUid = studentUid.trim();

        if (cleanUid.includes('/') || cleanUid.includes('\\') || cleanUid.includes(':')) {
            showError('Invalid QR Code Format. Please scan a valid Student ID.');
            return;
        }

        if (cleanUid.toLowerCase().startsWith('http')) {
            showError('Scanned content is a website URL, not a Student ID.');
            return;
        }

        const studentRef = doc(db, 'users', cleanUid);
        const studentSnap = await getDoc(studentRef);

        if (!studentSnap.exists()) {
            showError('Student not found in database');
            return;
        }

        const studentData = studentSnap.data();

        // Check if already present
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const attendanceRef = collection(db, 'attendance');
        const q = query(attendanceRef, where('studentId', '==', cleanUid));
        const existingDocs = await getDocs(q);

        let alreadyPresent = false;
        existingDocs.forEach(doc => {
            const data = doc.data();
            if (data.timestamp) {
                const recordDate = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                if (recordDate >= today) alreadyPresent = true;
            }
        });

        if (alreadyPresent) {
            showSuccess(studentData.fullName, 'Already marked Present today');
            return;
        }

        // Record Attendance
        await addDoc(attendanceRef, {
            studentId: studentUid,
            studentName: studentData.fullName,
            timestamp: serverTimestamp(),
            status: 'Present',
            device: 'scanner_station'
        });

        showSuccess(studentData.fullName, 'Attendance Recorded Successfully');

    } catch (error) {
        console.error('Attendance error:', error);
        showError('System Error: ' + error.message);
    }
}

// UI Helpers
function showProcessingState() {
    if (!resultCard) {
        resultCard = document.getElementById('result-card');
        statusIcon = document.getElementById('status-icon');
        statusMessage = document.getElementById('status-message');
        studentNameEl = document.getElementById('student-name');
        scanTimeEl = document.getElementById('scan-time');

        if (!resultCard) return; // Still missing
    }

    resultCard.style.display = 'block';
    resultCard.className = 'status-card';
    if (statusIcon) {
        statusIcon.className = 'fas fa-spinner fa-spin status-icon';
        statusIcon.style.color = '#3498db';
    }
    if (statusMessage) statusMessage.textContent = 'Processing...';
    if (studentNameEl) studentNameEl.textContent = '';
    if (scanTimeEl) scanTimeEl.textContent = '';
}

function showSuccess(name, message) {
    if (!resultCard) {
        resultCard = document.getElementById('result-card');
        // Try to recover
        if (!statusIcon) statusIcon = document.getElementById('status-icon');
        if (!statusMessage) statusMessage = document.getElementById('status-message');
        if (!studentNameEl) studentNameEl = document.getElementById('student-name');
        if (!scanTimeEl) scanTimeEl = document.getElementById('scan-time');

        if (!resultCard) return;
    }

    resultCard.style.display = 'block';

    if (message.includes('Already')) {
        if (statusIcon) {
            statusIcon.className = 'fas fa-info-circle status-icon';
            statusIcon.style.color = '#f39c12';
        }
        if (statusMessage) statusMessage.style.color = '#f39c12';
    } else {
        if (statusIcon) {
            statusIcon.className = 'fas fa-check-circle status-icon';
            statusIcon.style.color = '#27ae60';
        }
        if (statusMessage) statusMessage.style.color = '#2c3e50';
    }

    if (statusMessage) statusMessage.textContent = message;
    if (studentNameEl) studentNameEl.textContent = name;

    const now = new Date();
    if (scanTimeEl) {
        scanTimeEl.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
    }
}

function showError(msg) {
    if (!resultCard) {
        resultCard = document.getElementById('result-card');
        // Try to recover other elements too
        if (!statusIcon) statusIcon = document.getElementById('status-icon');
        if (!statusMessage) statusMessage = document.getElementById('status-message');
        if (!studentNameEl) studentNameEl = document.getElementById('student-name');
        if (!scanTimeEl) scanTimeEl = document.getElementById('scan-time');

        if (!resultCard) return;
    }

    resultCard.style.display = 'block';
    if (statusIcon) {
        statusIcon.className = 'fas fa-times-circle status-icon';
        statusIcon.style.color = '#c0392b';
    }
    if (statusMessage) {
        statusMessage.textContent = 'Error Recording Attendance';
        statusMessage.style.color = '#c0392b';
    }
    if (studentNameEl) studentNameEl.textContent = msg;
    if (scanTimeEl) scanTimeEl.textContent = '';
}
