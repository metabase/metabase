import registerCypressGrep from "@cypress/grep"; // eslint-disable-line import/order
registerCypressGrep();

import "@cypress/skip-test/support";
import "@testing-library/cypress/add-commands";
import "cypress-real-events/support";
import addContext from "mochawesome/addContext";
import "./commands";

Cypress.on("uncaught:exception", (err, runnable) => false);

Cypress.on("test:before:run", () => {
  // Check wether FE is running in dev mode
  const feHealthcheck = Cypress.env().feHealthcheck;
  if (feHealthcheck?.enabled) {
    fetch(feHealthcheck.url).catch(() =>
      alert(
        `⛔️ ${feHealthcheck.url} is not available.\n\nIs dev server running?`,
      ),
    );
  }
});

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

    Cypress.Mochawesome.context.forEach(ctx => {
      addContext({ test }, ctx);
    });

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

  Cypress.Mochawesome = undefined;
});

// required for cypress-terminal-report to be able to find logs after the test
// is finished
Cypress.Commands.add("addTestContext", context => {
  if (!Cypress.Mochawesome) {
    Cypress.Mochawesome = createMochawesomeObject();
  }

  Cypress.Mochawesome.context.push(context);
});

function createMochawesomeObject() {
  return {
    currentAttemptScreenshots: [],
    attempts: [],
    context: [],
  };
}

/**
 * Our app registers beforeunload event listener e.g. when editing a native SQL question.
 * Cypress does not automatically close the browser prompt and does not allow manually
 * interacting with it (unlike with window.confirm). The test will hang forever with
 * the prompt displayed and will eventually time out. We need to work around this by
 * monkey-patching window.addEventListener to ignore beforeunload event handlers.
 *
 * @see https://github.com/cypress-io/cypress/issues/2118
 */
Cypress.on("window:load", window => {
  const addEventListener = window.addEventListener;

  window.addEventListener = function (event) {
    if (event === "beforeunload") {
      return;
    }

    return addEventListener.apply(this, arguments);
  };
});

// cypress-terminal-report
afterEach(() => {
  cy.wait(50, { log: false }).then(() =>
    cy.addTestContext(Cypress.TerminalReport.getLogs("txt")),
  );
});

const options = {
  collectTypes: [
    "cons:log",
    "cons:info",
    // 'cons:warn', - intentionally disabled because of noise from mbql
    "cons:error",
    "cy:log",
    "cy:xhr",
    "cy:request",
    "cy:intercept",
    "cy:command",
  ],
};
// Ensure that after plugin installation is after the afterEach handling the integration.
require("cypress-terminal-report/src/installLogsCollector")(options);
