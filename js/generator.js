
import { db } from './firebaseConfig.js';
import {
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// DOM Elements (assigned on init)
let studentListEl, searchInput, cardName, cardId, qrCodeEl;

let allStudents = [];
let initialized = false;

// Initialize
export async function initGenerator() {
    if (initialized) return;

    // Assign DOM elements from the current document context
    studentListEl = document.getElementById('studentList');
    searchInput = document.getElementById('searchInput');
    cardName = document.getElementById('cardName');
    cardId = document.getElementById('cardId');
    qrCodeEl = document.getElementById('qrCode');

    if (!studentListEl || !searchInput) {
        console.error("QR Generator elements not found in DOM");
        return;
    }

    await fetchStudents();
    renderStudentList(allStudents);

    // Setup Search
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allStudents.filter(s =>
            (s.fullName && s.fullName.toLowerCase().includes(term)) ||
            (s.email && s.email.toLowerCase().includes(term))
        );
        renderStudentList(filtered);
    });

    initialized = true;
}

// Fetch Students
async function fetchStudents() {
    try {
        const q = query(
            collection(db, 'users'),
            where('role', '==', 'student')
        );

        const querySnapshot = await getDocs(q);
        allStudents = [];

        querySnapshot.forEach((doc) => {
            allStudents.push({
                id: doc.id,
                ...doc.data()
            });
        });

        console.log(`Loaded ${allStudents.length} students`);

    } catch (error) {
        console.error('Error fetching students:', error);
        if (studentListEl)
            studentListEl.innerHTML = `<div style="padding:15px; text-align:center; color:red;">Error loading students</div>`;
    }
}

// Render List
function renderStudentList(students) {
    if (!studentListEl) return;
    studentListEl.innerHTML = '';

    if (students.length === 0) {
        studentListEl.innerHTML = `<div style="padding:15px; text-align:center; color:#999;">No students found</div>`;
        return;
    }

    students.forEach(student => {
        const item = document.createElement('div');
        item.className = 'student-item';
        item.onclick = () => selectStudent(student, item);

        // Initials for avatar
        const initials = (student.fullName || 'Unknown')
            .split(' ')
            .map(n => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();

        item.innerHTML = `
            <div class="student-avatar">${initials}</div>
            <div>
                <div style="font-weight:600;">${student.fullName || 'No Name'}</div>
                <div style="font-size:0.8rem; color:#999;">${student.email || '-'}</div>
            </div>
        `;

        studentListEl.appendChild(item);
    });
}

// Select Student & Generate QR
function selectStudent(student, itemEl) {
    // Update UI
    document.querySelectorAll('.student-item').forEach(el => el.classList.remove('active'));
    itemEl.classList.add('active');

    // Update Card
    if (cardName) cardName.textContent = student.fullName || 'Student';
    if (cardId) cardId.textContent = student.id;

    // Generate QR
    if (!qrCodeEl) return;
    qrCodeEl.innerHTML = ''; // Clear previous

    try {
        new QRCode(qrCodeEl, {
            text: student.id,
            width: 120,
            height: 120,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    } catch (e) {
        console.error("QR Gen Error:", e);
        qrCodeEl.textContent = "Error generating QR";
    }
}
