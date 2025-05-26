const path = require("path");

const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: `http://localhost:${process.env.CLIENT_PORT}`,
    supportFile: path.resolve(path.join(__dirname, "./cypress.js")),
    specPattern: path.resolve(path.join(__dirname, "../test/**/*.cy.spec.js")),
    defaultBrowser: "chrome",
  },
});
