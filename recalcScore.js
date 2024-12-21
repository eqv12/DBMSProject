const sqlite3 = require("sqlite3").verbose();

// Initialize SQLite database
let db = new sqlite3.Database("students.db");

// Function to calculate percentile
function calculatePercentile(studentTotal) {
  return new Promise((resolve, reject) => {
    // Query to fetch all totals from the database
    const query = `SELECT total FROM marks`;

    db.all(query, [], (err, rows) => {
      if (err) {
        reject("Error fetching data: " + err);
        return;
      }

      // Extract total scores into an array
      const totals = rows.map((row) => row.total);

      // Count scores below the student's total
      const belowCount = totals.filter((score) => score < studentTotal).length;

      // Calculate the percentile
      const percentile = (belowCount / totals.length) * 100;

      // Resolve the promise with the percentile
      resolve(parseFloat(percentile.toFixed(2))); // Rounded to 2 decimal places
    });
  });
}

// Function to recalculate percentiles for all students
async function recalculatePercentiles() {
  db.all(`SELECT DISTINCT student_id FROM marks`, [], async (err, students) => {
    if (err) {
      console.error("Error fetching student IDs:", err);
      return;
    }

    for (const student of students) {
      const { student_id } = student;

      // Fetch total marks for each subject of the student
      db.all(`SELECT total, rowid FROM marks WHERE student_id = ?`, [student_id], async (err, marks) => {
        if (err) {
          console.error(`Error fetching marks for student ID ${student_id}:`, err);
          return;
        }

        for (const mark of marks) {
          const { total, rowid } = mark;

          try {
            // Calculate percentile for the current total
            const percentile = await calculatePercentile(total);

            // Update the database with the calculated percentile
            db.run(`UPDATE marks SET relative_score = ? WHERE rowid = ?`, [percentile, rowid], (err) => {
              if (err) {
                console.error(`Error updating percentile for row ${rowid}:`, err);
              }
            });
          } catch (error) {
            console.error("Error calculating percentile:", error);
          }
        }
      });
    }
  });
}

// Run the recalculation
recalculatePercentiles();
