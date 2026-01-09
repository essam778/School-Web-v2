const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * Scheduled function to mark students as "Absent" if they haven't scanned in.
 * Runs daily at 8:00 AM Cairo time (EET).
 */
exports.markAbsentStudents = functions.pubsub
    .schedule("0 8 * * *") // Run at 8:00 AM every day
    .timeZone("Africa/Cairo")
    .onRun(async (context) => {
        console.log("Starting automated absence check...");

        // 1. Define time range for "Today" (from 00:00 to now)
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        try {
            // 2. Fetch all active students
            const usersSnapshot = await db
                .collection("users")
                .where("role", "==", "student")
                .where("isActive", "==", true)
                .get();

            if (usersSnapshot.empty) {
                console.log("No active students found.");
                return null;
            }

            console.log(`Found ${usersSnapshot.size} active students.`);

            // 3. Fetch all "Present" attendance records for today
            // OPTIMIZATION: Query only by timestamp to avoid composite index error.
            const attendanceSnapshot = await db
                .collection("attendance")
                .where("timestamp", ">=", todayStart)
                .get();

            // Create a Set of student IDs present today
            const presentStudentIds = new Set();
            attendanceSnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.studentId && data.status === 'Present') {
                    presentStudentIds.add(data.studentId);
                }
            });

            console.log(`Found ${presentStudentIds.size} present students.`);

            // 4. Identify Absent Students and prepare Batch Write
            const batch = db.batch();
            let absentCount = 0;
            const attendanceCollection = db.collection("attendance");

            usersSnapshot.forEach((userDoc) => {
                const studentId = userDoc.id;
                const studentData = userDoc.data();

                if (!presentStudentIds.has(studentId)) {
                    // Student is absent
                    const newDocRef = attendanceCollection.doc();

                    batch.set(newDocRef, {
                        studentId: studentId,
                        studentName: studentData.fullName || "Unknown",
                        timestamp: admin.firestore.FieldValue.serverTimestamp(), // Mark time as 8:00 AM
                        status: "Absent",
                        automated: true,
                        date: now.toISOString()
                    });

                    absentCount++;
                }
            });

            // 5. Commit Batch
            if (absentCount > 0) {
                // Firestore batches are limited to 500 ops.
                // Assuming <500 for this scope.
                await batch.commit();
                console.log(`Successfully marked ${absentCount} students as Absent.`);
            } else {
                console.log("All students are present! Active day.");
            }

            return null;

        } catch (error) {
            console.error("Error in markAbsentStudents function:", error);
            return null;
        }
    });
