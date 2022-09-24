require("dotenv").config();
const express = require("express");
const router = express.Router();
const User = require("../models/user");
const userTasks = require("../models/userTasks");
const IMP = require("../models/confidential");
const Tasks = require("../models/tasks");
const Admin = require("../models/admin");
const { google } = require("googleapis");

const coding_id = process.env.CODING_ID;
const design_id = process.env.DESIGN_ID;
const explore_id = process.env.EXPLORE_ID;

const isAuthenticated = (req, res, next) => {
  if (!req.session.userId) {
    res.redirect("/login");
  } else {
    next();
  }
};

const isAdmin = (req, res, next) => {
  if (!req.session.adminToken) {
    return res.json({ code: 403, message: "Unauthorized" });
  }
  if (req.session.adminToken !== process.env.TOKEN) {
    res.json({ code: 400, message: "Invalid trust token" });
  } else {
    next();
  }
};

const isHypeUser = (req, res, next) => {
  if (req.session.hypertextUser) {
    res.json({ code: 403, message: "Forbidden" });
  } else {
    next();
  }
};

const isEnabled = async (req, res, next) => {
  const data = await IMP.findOne({ power_admin: 1 });
  if (!data.competition_enabled) {
    res.json({
      code: 403,
      message: "Competition Has Not Started Yet. Please wait until 1st october",
    });
  } else {
    next();
  }
};

router.get("/:id", isEnabled, isHypeUser, (req, res, next) => {
  Tasks.findOne({ task_id: req.params.id }, (err, data) => {
    if (!data) {
      res.send("No task was found with the given ID");
    } else {
      res.render("tasks", {
        id: data.task_id,
        title: data.task_title,
        description: data.big_description,
      });
    }
  });
});

router.post("/addtask/success", isAuthenticated, isAdmin, async (req, res) => {
  let c;
  Tasks.findOne({}, async (err, data) => {
    if (data) {
      const taskdata = await Tasks.find().limit(1).sort({ $natural: -1 });
      c = taskdata[0].task_id + 100;
    } else {
      c = 100;
    }

    let target = req.body.advance;
    let finalString = target.replaceAll('"', "");

    let newTask = new Tasks({
      task_id: c,
      task_title: req.body.title,
      task_description: req.body.smalldescription,
      task_category: req.body.category,
      big_description: req.body.bigdescription,
      advanceTask: finalString,
    });

    newTask.save((err, Data) => {
      if (err) {
        console.log(err);
      } else {
        console.log("Successfully added records for tasks");
      }
    });

    res.redirect("/admin");
  });
});

router.post(
  "/choose/:id",
  isEnabled,
  isAuthenticated,
  isHypeUser,
  async (req, res, next) => {
    const task = await Tasks.findOne({ task_id: req.params.id });
    if (!task) {
      res.sendStatus(404);
    } else {
      const taskData = await Tasks.findOne({ task_id: req.params.id });
      userTasks
        .findOne({ user_id: req.session.userId })
        .then((task) => {
          task.choosed_tasks.push({
            task_title: taskData.task_title,
            task_description: taskData.task_description,
            task_id: taskData.task_id,
            task_category: taskData.task_category,
          });
          task
            .save()
            .then(() => {
              return "Success";
            })
            .catch(console.log);
        })
        .catch(console.log);

      res.redirect("/profile");
    }
  }
);

router.post(
  "/submit/:id",
  isEnabled,
  isAuthenticated,
  isHypeUser,
  async (req, res, next) => {
    const userData = await userTasks.findOne({ user_id: req.session.userId });
    if (!userData) {
      return res.send("User does not exists in the database");
    } else {
      const taskData = await userTasks.findOne({ user_id: req.session.userId });
      const task_dat = await Tasks.findOne({ task_id: req.params.id });
      const user = await User.findOne({ unique_id: req.session.userId });

      var choosedTasksArray = taskData.choosed_tasks;
      var sheetDataArray = task_dat.sheetData;

      const sheetResults = sheetDataArray.map(function (data) {
        return {
          userid: data.userId,
          sheetid: data.sheetId,
        };
      });

      if (sheetResults.length < 1) {
        Tasks.findOne({ task_id: req.params.id })
          .then((task) => {
            task.sheetData.push({
              userId: req.session.userId,
              sheetId: 2,
            });
            task
              .save()
              .then(() => {
                return "Success";
              })
              .catch(console.log);
          })
          .catch(console.log);
      } else {
        let elemant = sheetResults[sheetResults.length - 1];
        let number = elemant.sheetid + 1;
        Tasks.findOne({ task_id: req.params.id })
          .then((task) => {
            task.sheetData.push({
              userId: req.session.userId,
              sheetId: number,
            });
            task
              .save()
              .then(() => {
                return "Success";
              })
              .catch(console.log);
          })
          .catch(console.log);
      }

      const choosedResults = choosedTasksArray.map(function (data) {
        return {
          id: data._id,
          task_title: data.task_title,
          task_description: data.task_description,
          task_id: data.task_id,
          task_category: data.task_category,
        };
      });

      var currentdate = new Date();
      let type;

      if (choosedResults[0].task_category === "CODING") {
        type = coding_id;
      } else if (choosedResults[0].task_category === "DESIGN") {
        type = design_id;
      } else if (choosedResults[0].task_category === "EXPLORE") {
        type = explore_id;
      }

      (async () => {
        try {
          const { sheets } = await authentication();

          const writeReq = await sheets.spreadsheets.values.append({
            spreadsheetId: type,
            range: req.params.id,
            valueInputOption: "USER_ENTERED",
            resource: {
              values: [
                [
                  currentdate,
                  user.email,
                  user.competitor_id,
                  user.username,
                  req.body.url,
                  "No Feedback",
                  "0",
                  "Pending",
                ],
              ],
            },
          });

          if (writeReq.status === 200) {
            console.log("Spreadsheet updated");
          } else {
            console.log("Somethign went wrong while updating the spreadsheet.");
          }
        } catch (e) {
          console.log("ERROR WHILE UPDATING THE SPREADSHEET", e);
        }
      })();

      userTasks
        .findOne({ user_id: req.session.userId })
        .then((task) => {
          task.pending_tasks.push({
            task_title: task_dat.task_title,
            task_description: task_dat.task_description,
            task_id: task_dat.task_id,
            task_category: task_dat.task_category,
          });
          task
            .save()
            .then(() => {
              return "Success";
            })
            .catch(console.log);
        })
        .catch(console.log);
      Admin.findOne({ number: 1 })
        .then((task) => {
          task.taskData.push({
            username: user.username,
            userId: user.unique_id,
            task_title: task_dat.task_title,
            task_description: task_dat.task_description,
            task_id: task_dat.task_id,
            task_category: task_dat.task_category,
            project_url: req.body.url,
            feedback: req.body.feedback,
          });
          task
            .save()
            .then(() => {
              return "Success";
            })
            .catch(console.log);
        })
        .catch(console.log);

      await userTasks.update(
        { _id: taskData._id },
        { $pull: { choosed_tasks: { _id: choosedResults[0].id } } }
      );

      res.redirect("/profile");
    }
  }
);

router.post(
  "/resubmit/:id",
  isEnabled,
  isAuthenticated,
  isHypeUser,
  async (req, res, next) => {
    const userData = await userTasks.findOne({ user_id: req.session.userId });
    if (!userData) {
      return res.send("User does not exists in the database");
    } else {
      const taskData = await userTasks.findOne({ user_id: req.session.userId });
      const task_dat = await Tasks.findOne({ task_id: req.params.id });
      const user = await User.findOne({ unique_id: req.session.userId });

      var declinedTasksArray = taskData.declined_tasks;
      var sheetDataArray = task_dat.sheetData;

      var currentdate = new Date();

      const sheetResults = sheetDataArray
        .filter(function (data) {
          return data.userId === req.session.userId;
        })
        .map(function (data) {
          return {
            userid: data.userId,
            sheetid: data.sheetId,
          };
        });

      const declinedResults = declinedTasksArray.map(function (data) {
        return {
          id: data._id,
          task_title: data.task_title,
          task_description: data.task_description,
          task_id: data.task_id,
          task_category: data.task_category,
        };
      });

      let type;

      if (declinedResults[0].task_category === "CODING") {
        type = coding_id;
      } else if (declinedResults[0].task_category === "DESIGN") {
        type = design_id;
      } else if (declinedResults[0].task_category === "EXPLORE") {
        type = explore_id;
      }

      (async () => {
        try {
          const { sheets } = await authentication();

          const writeReq = await sheets.spreadsheets.values.update({
            spreadsheetId: type,
            range: `${req.params.id}!A${sheetResults[0].sheetid}`,
            valueInputOption: "USER_ENTERED",
            resource: {
              range: `${req.params.id}!A${sheetResults[0].sheetid}`,
              majorDimension: "ROWS",
              values: [
                [
                  currentdate,
                  userData.email,
                  userData.competitor_id,
                  userData.username,
                  req.body.url,
                  "No Feedback",
                  "0",
                  "Pending",
                ],
              ],
            },
          });

          if (writeReq.status === 200) {
            console.log("Spreadsheet updated");
          } else {
            console.log("Somethign went wrong while updating the spreadsheet.");
          }
        } catch (e) {
          console.log("ERROR WHILE UPDATING THE SPREADSHEET", e);
        }
      })();

      userTasks
        .findOne({ user_id: req.session.userId })
        .then((task) => {
          task.pending_tasks.push({
            task_title: task_dat.task_title,
            task_description: task_dat.task_description,
            task_id: task_dat.task_id,
            task_category: task_dat.task_category,
          });
          task
            .save()
            .then(() => {
              return "Success";
            })
            .catch(console.log);
        })
        .catch(console.log);
      Admin.findOne({ number: 1 })
        .then((task) => {
          task.taskData.push({
            username: user.username,
            userId: user.unique_id,
            task_title: task_dat.task_title,
            task_description: task_dat.task_description,
            task_id: task_dat.task_id,
            task_category: task_dat.task_category,
            project_url: req.body.url,
            feedback: req.body.feedback,
          });
          task
            .save()
            .then(() => {
              return "Success";
            })
            .catch(console.log);
        })
        .catch(console.log);

      await userTasks.update(
        { _id: taskData._id },
        { $pull: { declined_tasks: { _id: declinedResults[0].id } } }
      );

      res.redirect("/profile");
    }
  }
);

const authentication = async () => {
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: "https://www.googleapis.com/auth/spreadsheets",
  });

  const client = await auth.getClient();

  const sheets = google.sheets({
    version: "v4",
    auth: client,
  });
  return { sheets };
};

module.exports = router;
