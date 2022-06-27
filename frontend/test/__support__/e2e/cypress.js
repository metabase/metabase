require("cypress-grep")();

import addContext from "mochawesome/addContext";
import "@testing-library/cypress/add-commands";
import "cypress-real-events/support";
import "@cypress/skip-test/support";
import "@percy/cypress";
import "./commands";

Cypress.on("uncaught:exception", (err, runnable) => false);

const titleToFileName = title => title.replace(/[>]/g, "");

Cypress.on("test:after:run", (test, runnable) => {
  if (test.state === "failed") {
    const filename = `${titleToFileName(
      runnable.parent.title,
    )} -- ${titleToFileName(test.title)} (failed).png`;
    addContext({ test }, `../../screenshots/${Cypress.spec.name}/${filename}`);
    addContext({ test }, `../../videos/${Cypress.spec.name}.mp4`);
  }
});
