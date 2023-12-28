const { rmdirSync } = require("fs");

const removeDirectory = path => {
  try {
    rmdirSync(path, { maxRetries: 10, recursive: true });
  } catch (error) {
    throw Error(`Error while deleting ${path}. Original error: ${error}`);
  }
  return null;
};

const deleteDownloadsFolder = () =>
  cy.task("removeDirectory", Cypress.config("downloadsFolder"));
const addCustomCommand = () =>
  Cypress.Commands.add("deleteDownloadsFolder", deleteDownloadsFolder);

module.exports = {
  removeDirectory,
  deleteDownloadsFolder,
  addCustomCommand,
};
