const fs = require("fs");

const path = require("path");

const removeDirectory = path => {
  try {
    fs.rmdirSync(path, { maxRetries: 10, recursive: true });
  } catch (error) {
    console.log("Error while removing directory", path, error);
  }
  return null;
};

const deleteDownloadsFolder = () =>
  cy.task("removeDirectory", Cypress.config("downloadsFolder"));

const isFileExist = path => fs.existsSync(path);

const findFiles = ({ path, fileName }) => {
  if (!fs.existsSync(path)) {
    return null;
  }

  return fs
    .readdirSync(path)
    .filter(file => file.includes(fileName) && isDownloaded(file));
};

const isDownloaded = file => !file.endsWith(".crdownload");

// slightly modified version of cy-verify-download
// https://github.com/elaichenkov/cy-verify-downloads/blob/master/src/index.js
const verifyDownload = (fileName, options) => {
  Cypress.log({
    name: "verifyDownload",
    message: `Waiting for the ${fileName} file to be exist`,
  });

  const defaultOptions = {
    timeout: 10000,
    interval: 200,
    contains: false,
  };

  const { timeout, interval, contains } = { ...defaultOptions, ...options };

  const downloadsFolder = Cypress.config("downloadsFolder");
  const downloadFileName = path.join(downloadsFolder, fileName);

  let retries = Math.floor(timeout / interval);

  const checkFile = result => {
    if (result) {
      return result;
    }

    if (retries < 1) {
      throw new Error(
        `Failed after ${timeout} time out. \nDue to couldn't find ${fileName} file in the ${downloadsFolder} folder`,
      );
    }
    cy.wait(interval, { log: false }).then(() => {
      retries--;
      return resolveValue();
    });
  };

  const resolveValue = () => {
    let result;

    if (contains) {
      result = cy
        .task("findFiles", { path: downloadsFolder, fileName })
        .then(files => {
          if (files !== null) {
            if (files.length > 1) {
              cy.log(
                `**WARNING!** More than one file found for the **'${fileName}'** pattern: [${files}] - the first one **[${files[0]}]** will be used`,
              );
            }

            return cy.task(
              "isFileExist",
              path.join(downloadsFolder, files[0] ?? ""),
            );
          }
        });
    } else {
      result = cy.task("isFileExist", downloadFileName);
    }

    return result.then(checkFile);
  };

  return resolveValue().then(isExist => {
    expect(isExist, `The ${fileName} file has been downloaded successfully`).to
      .be.true;
  });
};

const addCustomCommands = () => {
  Cypress.Commands.add("deleteDownloadsFolder", deleteDownloadsFolder);
  Cypress.Commands.add("verifyDownload", verifyDownload);
};

module.exports = {
  removeDirectory,
  deleteDownloadsFolder,
  addCustomCommands,
  verifyDownloadTasks: {
    isFileExist,
    findFiles,
  },
};
