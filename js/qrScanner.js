// js/qrScanner.js - Fixed QR Code Scanner
import { FirebaseHelpers } from './firebaseConfig.js';
import { verifyQRCodePayload } from './qrCodeUtils.js';

let scanningActive = false;
let videoStream = null;

// Load jsQR library dynamically
async function loadJsQRLibrary() {
    return new Promise((resolve, reject) => {
        if (typeof jsQR !== 'undefined') {
            resolve(jsQR);
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
        script.onload = () => {
            console.log('jsQR library loaded successfully');
            resolve(window.jsQR);
        };
        script.onerror = () => {
            console.error('Failed to load jsQR library');
            reject(new Error('Failed to load jsQR library'));
        };
        document.head.appendChild(script);
    });
}

// Create QR scanner modal interface
function createQRScannerModal() {
    if (document.getElementById('qrScannerModal')) {
        return;
    }
    
    const modalHTML = `
    <div id="qrScannerModal" class="modal" style="display: none; z-index: 9999;">
        <div class="modal-content" style="max-width: 800px; width: 90%;">
            <div class="modal-header">
                <h3 class="modal-title">مسح رمز QR للحضور</h3>
                <button class="close-btn" onclick="closeQRScannerModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div id="scannerContainer" style="position: relative; width: 100%; text-align: center;">
                    <video id="qrVideo" autoplay playsinline style="width: 100%; max-width: 500px; height: auto; border: 2px solid #ddd; border-radius: 8px; margin: 0 auto; display: block;"></video>
                    <canvas id="qrCanvas" style="display: none;"></canvas>
                    <div id="scannerOverlay" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 250px; height: 250px; border: 3px solid #4CAF50; border-radius: 10px; box-shadow: 0 0 0 9999px rgba(0,0,0,0.5); pointer-events: none;">
                        <div style="position: absolute; top: -40px; left: 50%; transform: translateX(-50%); color: white; font-weight: bold; background: rgba(0,0,0,0.7); padding: 5px 10px; border-radius: 5px;">ضع رمز QR داخل الإطار</div>
                    </div>
                    <div id="scannerMessage" style="margin-top: 15px; color: #666; font-weight: bold;">جارِ البحث عن رمز QR...</div>
                    <div id="scannerResult" style="margin-top: 10px; color: #2196F3; font-weight: bold; min-height: 25px;"></div>
                </div>
                <div id="manualEntrySection" style="margin-top: 20px; padding: 15px; border: 1px solid #eee; border-radius: 8px; display: none;">
                    <h4>أو أدخل معرف الطالب يدويًا:</h4>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <input type="text" id="manualStudentId" placeholder="أدخل معرف الطالب" style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                        <button id="manualSubmitBtn" class="btn btn-primary">تسجيل الحضور</button>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeQRScannerModal()">إغلاق</button>
                <button class="btn btn-info" onclick="toggleManualEntry()">إدخال يدوي</button>
            </div>
        </div>
    </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Toggle manual entry section
window.toggleManualEntry = function() {
    const manualSection = document.getElementById('manualEntrySection');
    const videoElement = document.getElementById('qrVideo');
    const scannerMessage = document.getElementById('scannerMessage');
    const scannerOverlay = document.getElementById('scannerOverlay');
    
    if (manualSection.style.display === 'none' || !manualSection.style.display) {
        manualSection.style.display = 'block';
        videoElement.style.display = 'none';
        if (scannerOverlay) scannerOverlay.style.display = 'none';
        scannerMessage.textContent = 'الرجاء إدخال معرف الطالب يدويًا';
        stopVideoStream();
    } else {
        manualSection.style.display = 'none';
        videoElement.style.display = 'block';
        if (scannerOverlay) scannerOverlay.style.display = 'block';
        scannerMessage.textContent = 'جارِ البحث عن رمز QR...';
    }
};

// Close QR scanner modal
window.closeQRScannerModal = function() {
    const modal = document.getElementById('qrScannerModal');
    if (modal) {
        modal.style.display = 'none';
    }
    stopVideoStream();
    scanningActive = false;
};

// Stop video stream
function stopVideoStream() {
    const video = document.getElementById('qrVideo');
    if (video && video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
}

// Initialize QR scanner
async function initQRScanner(onScanSuccess, onError) {
    try {
        createQRScannerModal();
        
        const video = document.getElementById('qrVideo');
        if (!video) {
            throw new Error('QR scanner video element not found');
        }
        
        // Request camera access
        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: "environment",
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            
            video.srcObject = videoStream;
            
            video.addEventListener('loadedmetadata', () => {
                video.play().catch(e => console.log('Auto-play prevented:', e));
            });
            
            // Start scanning
            startScanning(video, onScanSuccess, onError);
            
        } catch (cameraError) {
            console.error('Camera access error:', cameraError);
            throw cameraError;
        }
        
    } catch (error) {
        console.error('Error initializing QR scanner:', error);
        
        // Show manual entry as fallback
        const manualSection = document.getElementById('manualEntrySection');
        if (manualSection) {
            manualSection.style.display = 'block';
        }
        
        const videoElement = document.getElementById('qrVideo');
        if (videoElement) {
            videoElement.style.display = 'none';
        }
        
        const scannerOverlay = document.getElementById('scannerOverlay');
        if (scannerOverlay) {
            scannerOverlay.style.display = 'none';
        }
        
        const scannerMessage = document.getElementById('scannerMessage');
        if (scannerMessage) {
            scannerMessage.textContent = 'لم يتم الوصول للكاميرا. استخدم الإدخال اليدوي.';
            scannerMessage.style.color = '#f44336';
        }
        
        if (onError) {
            onError(error);
        }
    }
}

// Start scanning loop
async function startScanning(video, onScanSuccess, onError) {
    try {
        await loadJsQRLibrary();
    } catch (error) {
        console.error('Failed to load jsQR:', error);
        if (onError) onError(error);
        return;
    }
    
    const canvasElement = document.getElementById('qrCanvas');
    const canvas = canvasElement.getContext('2d');
    
    scanningActive = true;
    
    function tick() {
        if (!scanningActive) return;
        
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvasElement.width = video.videoWidth;
            canvasElement.height = video.videoHeight;
            canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
            
            const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });
            
            if (code) {
                const resultDiv = document.getElementById('scannerResult');
                if (resultDiv) {
                    resultDiv.textContent = `تم اكتشاف رمز QR!`;
                    resultDiv.style.color = '#4CAF50';
                }
                
                // Verify payload
                const verification = verifyQRCodePayload(code.data);
                
                if (verification.valid) {
                    scanningActive = false;
                    
                    if (onScanSuccess) {
                        onScanSuccess(verification.data);
                    }
                    
                    setTimeout(() => {
                        closeQRScannerModal();
                    }, 500);
                } else {
                    const resultDiv = document.getElementById('scannerResult');
                    if (resultDiv) {
                        resultDiv.textContent = 'رمز QR غير صالح: ' + verification.error;
                        resultDiv.style.color = '#f44336';
                    }
                    
                    // Continue scanning for valid code
                    setTimeout(() => {
                        if (resultDiv) resultDiv.textContent = '';
                    }, 2000);
                }
            }
        }
        
        if (scanningActive) {
            requestAnimationFrame(tick);
        }
    }
    
    requestAnimationFrame(tick);
}

// Show QR scanner modal
async function showQRScannerModal(onScanSuccess, onError) {
    try {
        createQRScannerModal();
        
        const modal = document.getElementById('qrScannerModal');
        if (modal) {
            modal.style.display = 'block';
        }
        
        // Reset manual entry
        const manualSection = document.getElementById('manualEntrySection');
        if (manualSection) {
            manualSection.style.display = 'none';
        }
        
        const manualInput = document.getElementById('manualStudentId');
        if (manualInput) {
            manualInput.value = '';
        }
        
        // Initialize scanner
        await initQRScanner(onScanSuccess, onError);
        
        // Setup manual entry handler
        const manualSubmitBtn = document.getElementById('manualSubmitBtn');
        if (manualSubmitBtn) {
            manualSubmitBtn.onclick = function() {
                const studentIdInput = document.getElementById('manualStudentId');
                if (studentIdInput && studentIdInput.value.trim()) {
                    const studentId = studentIdInput.value.trim();
                    
                    const scanData = {
                        type: 'student_attendance',
                        studentId: studentId,
                        timestamp: Date.now()
                    };
                    
                    if (onScanSuccess) {
                        onScanSuccess(scanData);
                    }
                    
                    closeQRScannerModal();
                } else {
                    FirebaseHelpers.showToast('الرجاء إدخال معرف الطالب', 'error');
                }
            };
        }
        
    } catch (error) {
        console.error('Error showing QR scanner:', error);
        if (onError) {
            onError(error);
        }
    }
}

export {
    showQRScannerModal,
    initQRScanner,
    stopVideoStream
};