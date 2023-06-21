if (Cypress.env("DEPLOYSENTINEL_ENABLED")) {
  // Cypress analytics and the alternative to Cypress dashboard
  // Needs to sit at the top of this file to catch all exceptions!
  require("@deploysentinel/cypress-debugger/support");
  console.log(">>ds enabled 2");
}

import registerCypressGrep from "@cypress/grep";
registerCypressGrep();

import addContext from "mochawesome/addContext";
import "@testing-library/cypress/add-commands";
import "cypress-real-events/support";
import "@cypress/skip-test/support";
import "@percy/cypress";
import "./commands";

const runWithReplay = Cypress.env("REPLAYIO_ENABLED");

if (runWithReplay) {
  require("@replayio/cypress/support");
}

require("cy-verify-downloads").addCustomCommand();

Cypress.on("uncaught:exception", (err, runnable) => false);

Cypress.on("test:after:run", (test, runnable) => {
  if (test.state === "failed") {
    const titleToFileName = title => title.replace(/[>]/g, "");
    let { parent } = runnable;
    let filename = "";
    // This while is to be able to support more than one level of parent in the screenshot name
    while (parent && parent.title) {
      filename = `${titleToFileName(parent.title)} -- ${filename}`;
      parent = parent.parent;
    }
    filename += `${titleToFileName(test.title)} (failed).png`;
    addContext(
      { test },
      {
        title: "Screenshot",
        value: `../../screenshots/${Cypress.spec.name}/${filename}`,
      },
    );
    addContext(
      { test },
      { title: "Video", value: `../../videos/${Cypress.spec.name}.mp4` },
    );
  }
});
