// js/qrCodeUtils.js - Fixed QR Code utilities
import { db } from './firebaseConfig.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Load QR code library dynamically
async function loadQRLibrary() {
    return new Promise((resolve, reject) => {
        if (window.QRCode) {
            resolve(window.QRCode);
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        script.onload = () => {
            console.log('QRCode.js loaded successfully');
            resolve(window.QRCode);
        };
        script.onerror = () => {
            console.error('Failed to load QRCode.js');
            reject(new Error('Failed to load QRCode.js library'));
        };
        document.head.appendChild(script);
    });
}

// Generate QR code for a student - Returns DOM element
async function generateStudentQRCode(qrData) {
    try {
        await loadQRLibrary();
        
        // Create container for QR code
        const container = document.createElement('div');
        container.id = 'qr-code-container';
        container.style.display = 'inline-block';
        container.style.padding = '20px';
        container.style.background = 'white';
        container.style.borderRadius = '10px';
        
        // Generate QR code data string
        const qrString = typeof qrData === 'string' ? qrData : JSON.stringify(qrData);
        
        // Create QR code
        new QRCode(container, {
            text: qrString,
            width: 256,
            height: 256,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        
        return container;
    } catch (error) {
        console.error('Error generating QR code:', error);
        
        // Fallback: Create a text-based representation
        const fallbackDiv = document.createElement('div');
        fallbackDiv.style.padding = '20px';
        fallbackDiv.style.background = '#f0f0f0';
        fallbackDiv.style.borderRadius = '10px';
        fallbackDiv.style.textAlign = 'center';
        fallbackDiv.innerHTML = `
            <p style="color: #e74c3c; font-weight: bold; margin-bottom: 10px;">
                فشل تحميل مكتبة QR Code
            </p>
            <p style="font-size: 12px; word-break: break-all;">
                البيانات: ${typeof qrData === 'string' ? qrData : JSON.stringify(qrData)}
            </p>
        `;
        return fallbackDiv;
    }
}

// Generate simple QR code text (for cases where library fails)
function generateSimpleQRCodeText(studentId) {
    return JSON.stringify({
        type: 'student_attendance',
        studentId: studentId,
        timestamp: Date.now()
    });
}

// Get student QR code as data URL (for saving/downloading)
async function getStudentQRCodeDataURL(studentId) {
    try {
        await loadQRLibrary();
        
        return new Promise((resolve) => {
            const tempDiv = document.createElement('div');
            tempDiv.style.visibility = 'hidden';
            tempDiv.style.position = 'absolute';
            document.body.appendChild(tempDiv);
            
            const qrData = {
                type: 'student_attendance',
                studentId: studentId,
                timestamp: Date.now()
            };
            
            new QRCode(tempDiv, {
                text: JSON.stringify(qrData),
                width: 256,
                height: 256,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
            
            setTimeout(() => {
                const canvas = tempDiv.querySelector('canvas');
                if (canvas) {
                    const dataURL = canvas.toDataURL('image/png');
                    document.body.removeChild(tempDiv);
                    resolve(dataURL);
                } else {
                    const img = tempDiv.querySelector('img');
                    if (img) {
                        document.body.removeChild(tempDiv);
                        resolve(img.src);
                    } else {
                        document.body.removeChild(tempDiv);
                        resolve(null);
                    }
                }
            }, 500);
        });
    } catch (error) {
        console.error('Error getting QR code data URL:', error);
        return null;
    }
}

// Verify QR code payload
function verifyQRCodePayload(payload) {
    try {
        const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
        
        if (!data.type || data.type !== 'student_attendance') {
            return { valid: false, error: 'Invalid QR code type' };
        }
        
        if (!data.studentId) {
            return { valid: false, error: 'Missing student ID' };
        }
        
        // Check timestamp (within last 24 hours)
        const now = Date.now();
        const payloadTime = data.timestamp || now;
        const timeDiff = Math.abs(now - payloadTime);
        const maxTimeDiff = 24 * 60 * 60 * 1000;
        
        if (timeDiff > maxTimeDiff) {
            return { valid: false, error: 'QR code expired' };
        }
        
        return { valid: true, data: data };
    } catch (error) {
        return { valid: false, error: 'Invalid QR code format: ' + error.message };
    }
}

// Export functions
export {
    generateStudentQRCode,
    generateSimpleQRCodeText,
    getStudentQRCodeDataURL,
    verifyQRCodePayload
};