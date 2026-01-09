
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

    // Initialize DOM elements relative to the document (assuming they exist in the dashboard)
    resultCard = document.getElementById('result-card');
    statusIcon = document.getElementById('status-icon');
    statusMessage = document.getElementById('status-message');
    studentNameEl = document.getElementById('student-name');
    scanTimeEl = document.getElementById('scan-time');

    html5QrcodeScanner = new Html5QrcodeScanner(
        elementId,
        {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true
        },
        /* verbose= */ false
    );

    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
    isScanning = true;
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
            console.error("Failed to clear scanner", error);
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
    if (!resultCard) return;
    resultCard.style.display = 'block';
    resultCard.className = 'status-card';
    statusIcon.className = 'fas fa-spinner fa-spin status-icon';
    statusIcon.style.color = '#3498db';
    statusMessage.textContent = 'Processing...';
    studentNameEl.textContent = '';
    scanTimeEl.textContent = '';
}

function showSuccess(name, message) {
    if (!resultCard) return;
    resultCard.style.display = 'block';

    if (message.includes('Already')) {
        statusIcon.className = 'fas fa-info-circle status-icon';
        statusIcon.style.color = '#f39c12';
        statusMessage.style.color = '#f39c12';
    } else {
        statusIcon.className = 'fas fa-check-circle status-icon';
        statusIcon.style.color = '#27ae60';
        statusMessage.style.color = '#2c3e50';
    }

    statusMessage.textContent = message;
    studentNameEl.textContent = name;

    const now = new Date();
    scanTimeEl.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
}

function showError(msg) {
    if (!resultCard) return;
    resultCard.style.display = 'block';
    statusIcon.className = 'fas fa-times-circle status-icon';
    statusIcon.style.color = '#c0392b';
    statusMessage.textContent = 'Error Recording Attendance';
    statusMessage.style.color = '#c0392b';
    studentNameEl.textContent = msg;
    scanTimeEl.textContent = '';
}
