/* eslint-env node */

const electron = require("electron");
const request = require("request-promise");
const spawn = require("child_process").spawn;
const path = require("path");
const fs = require("fs");

const { app, BrowserWindow } = electron;

const PORT = Math.floor(Math.random() * 1000) + 13000;
const BASE_URL = `http://localhost:${PORT}`;

const APP_DATA_PATH = path.join(app.getPath("appData"), "Metabase");
try { fs.mkdirSync(APP_DATA_PATH); } catch (e) {}

const DB_PATH = path.join(APP_DATA_PATH, "metabase.db");

let INIT_HTML_PATH, UBERJAR_PATH;
if (process.env.NODE_ENV === "development") {
    INIT_HTML_PATH = path.join(path.dirname(__dirname), "resources", "frontend_client", "init.html");
    UBERJAR_PATH = path.join(path.dirname(__dirname), "target", "uberjar", "metabase.jar");
} else {
    INIT_HTML_PATH = path.join(path.dirname(__dirname), "app", "init.html");
    UBERJAR_PATH = path.join(path.dirname(__dirname), "app", "metabase.jar");
}

let mainWindow;
let serverProcess = spawn("java", ["-Djava.awt.headless=true", "-jar", UBERJAR_PATH], {
    env: {
        MB_JETTY_PORT: PORT,
        MB_DB_FILE: DB_PATH
    },
    detached: true,
    stdio: "inherit"
});

app.on("before-quit", function() {
    serverProcess.kill("SIGINT");
});

function createWindow() {
    mainWindow = new BrowserWindow({
        title: "Metabase",
        width: 800, height: 600
    });
    mainWindow.on("closed", function () {
        mainWindow = null;
    });
    mainWindow.loadURL(`file://${INIT_HTML_PATH}`);
    mainWindow.setProgressBar(-1);

    // mainWindow.webContents.openDevTools();

    (function poll() {
        request(`${BASE_URL}/health`).then(function() {
            mainWindow.loadURL(BASE_URL);
        }, function() {
            setTimeout(poll, 250)
        });
    })();
}

app.on("ready", createWindow);

app.on("window-all-closed", function () {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", function () {
    if (mainWindow === null) {
        createWindow();
    }
});
