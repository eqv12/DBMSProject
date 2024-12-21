const express = require("express");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const xlsx = require("xlsx");
const path = require("path");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Initialize SQLite database
let db = new sqlite3.Database("students.db");

db.serialize(() => {
  // Create tables if they don't exist
  db.run(`CREATE TABLE IF NOT EXISTS students (
    student_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    sem INTEGER,
    course TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS subjects (
    subject_id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_name TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS marks (
    student_id INTEGER,
    subject_id INTEGER,
    t1 INTEGER,
    t2 INTEGER,
    average REAL,
    ap INTEGER,
    tutorial INTEGER,
    semester_exam_mark INTEGER,
    total REAL,
    relative_score REAL,
    FOREIGN KEY(student_id) REFERENCES students(student_id),
    FOREIGN KEY(subject_id) REFERENCES subjects(subject_id)
  )`);

  // Insert subjects if they don't exist
  const subjects = ["WAD", "Structured Programming in C", "Data Structures", "DBMS"];
  subjects.forEach((subject) => {
    db.run(`INSERT OR IGNORE INTO subjects (subject_name) VALUES (?)`, [subject]);
  });
});

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
      console.log(percentile.toFixed(2));
      resolve(parseFloat(percentile.toFixed(2))); // Rounded to 2 decimal places
    });
  });
}

// Function to calculate relative score
function calculateRelativeScore(studentTotal, maxTotal) {
  return new Promise((resolve, reject) => {
    // Query to fetch all totals from the database
    const query = `SELECT total FROM marks`;

    db.all(query, [], (err, rows) => {
      if (err) {
        reject("Error fetching data: " + err);
        return;
      }

      // Ensure there are rows in the table
      if (rows.length === 0) {
        reject("No data found in the 'marks' table.");
        return;
      }

      // Extract total scores into an array
      const totals = rows.map((row) => parseFloat(row.total)).filter((value) => !isNaN(value));

      // Validate the totals array
      if (totals.length === 0) {
        reject("All 'total' values are invalid or non-numeric.");
        return;
      }

      // Calculate mean
      const mean = totals.reduce((sum, value) => sum + value, 0) / totals.length;

      // Calculate standard deviation
      const variance = totals.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / totals.length;
      const stdDev = Math.sqrt(variance);

      // Ensure stdDev is not zero to avoid division by zero
      if (stdDev === 0) {
        reject("Standard deviation is zero. Cannot calculate relative score.");
        return;
      }

      // Calculate the relative score
      const relativeScore = ((studentTotal - mean) / stdDev).toFixed(2);

      // Resolve the promise with the relative score
      resolve(parseFloat(relativeScore));
    });
  });
}

app.post("/submit", async (req, res) => {
  console.log(req.body);
  const { name, sem, course, ...subjects } = req.body;

  db.run(`INSERT INTO students (name, sem, course) VALUES (?, ?, ?)`, [name, sem, course], async function (err) {
    if (err) {
      console.log(err.message);
      return res.status(500).send("Error inserting student data");
    }

    const student_id = this.lastID;
    const maxTotal = 100; // Maximum possible total marks

    try {
      // Use Promise.all to handle asynchronous logic for each subject
      await Promise.all(
        Object.keys(subjects).map(async (key, index) => {
          const subject = subjects[key];
          const subject_id = index + 1;
          const t1 = parseInt(subject.t1);
          const t2 = parseInt(subject.t2);
          const average = (t1 + t2) / 2;
          const ap = parseInt(subject.ap);
          const tutorial = parseInt(subject.tutorial);
          const semester_exam_mark = parseInt(subject.semester_exam_mark);
          const total = average + ap + tutorial + semester_exam_mark;
          //  const relative_score = await calculateRelativeScore(total, maxTotal);
          const relative_score = await calculatePercentile(total);
          console.log(relative_score);

          // Insert marks into the database
          return new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO marks (student_id, subject_id, t1, t2, average, ap, tutorial, semester_exam_mark, total, relative_score)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [student_id, subject_id, t1, t2, average, ap, tutorial, semester_exam_mark, total, relative_score],
              function (err) {
                if (err) {
                  return reject(err);
                }
                resolve();
              }
            );
          });
        })
      );

      res.redirect("/bellcurve");
    } catch (error) {
      console.error("Error processing subjects:", error);
      res.status(500).send("Error processing subjects");
    }
  });
});

// Route to handle form submission
// app.post("/submit", async (req, res) => {
//   console.log(req.body);
//   const { name, sem, course, ...subjects } = req.body;
//   db.run(`INSERT INTO students (name, sem, course) VALUES (?, ?, ?)`, [name, sem, course], function (err) {
//     if (err) {
//       return console.log(err.message);
//     }
//     const student_id = this.lastID;
//     const maxTotal = 100; // Maximum possible total marks
//     Object.keys(subjects).forEach((key, index) => {
//       const subject = subjects[key];
//       const subject_id = index + 1;
//       const t1 = parseInt(subject.t1);
//       const t2 = parseInt(subject.t2);
//       const average = (t1 + t2) / 2;
//       const ap = parseInt(subject.ap);
//       const tutorial = parseInt(subject.tutorial);
//       const semester_exam_mark = parseInt(subject.semester_exam_mark);
//       const total = average + ap + tutorial + semester_exam_mark;
//       const relative_score = await calculateRelativeScore(total, maxTotal);
//       console.log(relative_score);
//       db.run(
//         `INSERT INTO marks (student_id, subject_id, t1, t2, average, ap, tutorial, semester_exam_mark, total, relative_score)
//           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//         [student_id, subject_id, t1, t2, average, ap, tutorial, semester_exam_mark, total, relative_score]
//       );
//     });
//     res.redirect("/bellcurve");
//   });
// });

// Route to handle Excel file upload
app.post("/upload", upload.single("excel"), (req, res) => {
  const workbook = xlsx.readFile(req.file.path);
  const sheet_name_list = workbook.SheetNames;
  const xlData = xlsx.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);

  xlData.forEach((row) => {
    db.run(`INSERT INTO students (name, sem, course) VALUES (?, ?, ?)`, [row.name, row.sem, row.course], function (err) {
      if (err) {
        return console.log(err.message);
      }
      const student_id = this.lastID;
      const maxTotal = 100; // Maximum possible total marks
      for (let i = 1; i <= 4; i++) {
        const subject_id = i;
        const t1 = row[`subject${i}_t1`];
        const t2 = row[`subject${i}_t2`];
        const average = (t1 + t2) / 2;
        const ap = row[`subject${i}_ap`];
        const tutorial = row[`subject${i}_tutorial`];
        const semester_exam_mark = row[`subject${i}_semester_exam_mark`];
        const total = average + ap + tutorial + semester_exam_mark;
        const relative_score = calculateRelativeScore(total, maxTotal);
        console.log(relative_score);
        db.run(
          `INSERT INTO marks (student_id, subject_id, t1, t2, average, ap, tutorial, semester_exam_mark, total, relative_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [student_id, subject_id, t1, t2, average, ap, tutorial, semester_exam_mark, total, relative_score]
        );
      }
    });
  });
  res.redirect("/bellcurve");
});

// Route to display the bell curve
app.get("/bellcurve", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "bellcurve.html"));
});

// Route to get totals for bell curve
app.get("/getTotals", (req, res) => {
  db.all(`SELECT SUM(relative_score) AS relative_score FROM marks GROUP BY student_id`, [], (err, rows) => {
    if (err) {
      throw err;
    }
    const relative_scores = rows.map((row) => row.relative_score);
    // Calculate frequency for each relative score
    const frequencies = {};
    relative_scores.forEach((score) => {
      frequencies[score] = (frequencies[score] || 0) + 1;
    });
    const labels = Object.keys(frequencies)
      .map(Number)
      .sort((a, b) => a - b);
    const freqData = labels.map((label) => frequencies[label]);
    res.json({ labels: labels, frequencies: freqData });
  });
});

app.get("/getSubjectTotals", (req, res) => {
  const subjectId = req.query.subjectId;
  db.all(`SELECT relative_score FROM marks WHERE subject_id = ?`, [subjectId], (err, rows) => {
    if (err) {
      throw err;
    }
    const relative_scores = rows.map((row) => row.relative_score);
    // Calculate frequency for each relative score
    const frequencies = {};
    relative_scores.forEach((score) => {
      frequencies[score] = (frequencies[score] || 0) + 1;
    });
    const labels = Object.keys(frequencies)
      .map(Number)
      .sort((a, b) => a - b);
    const freqData = labels.map((label) => frequencies[label]);
    res.json({ labels: labels, frequencies: freqData });
  });
});

// Route to get all grades
app.get("/getAllGrades", (req, res) => {
  db.all(
    `SELECT students.name, students.sem, students.course, subjects.subject_name, marks.t1, marks.t2, marks.average, marks.ap, marks.tutorial, marks.semester_exam_mark, marks.total, marks.relative_score
     FROM marks
     JOIN students ON marks.student_id = students.student_id
     JOIN subjects ON marks.subject_id = subjects.subject_id`,
    [],
    (err, rows) => {
      if (err) {
        throw err;
      }
      res.json(rows);
    }
  );
});

app.listen(3000, () => {
  console.log("Server started on port 3000");
});
