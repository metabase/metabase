import registerCypressGrep from "@cypress/grep"; // eslint-disable-line import/order
registerCypressGrep();

import "@cypress/skip-test/support";
import "@testing-library/cypress/add-commands";
import { configure } from "@testing-library/cypress";
import "cypress-real-events/support";
import addContext from "mochawesome/addContext";
import "./commands";

const isCI = Cypress.env("CI");
const isNetworkThrottlingEnabled = Cypress.env("ENABLE_NETWORK_THROTTLING");

// remove default html output on test failure
configure({
  getElementError: (message, container) => {
    // to re-enable the default stack trace, uncomment
    // import { prettyDOM } from "@testing-library/dom";
    // const error = new Error(
    //  [message, prettyDOM(container)].filter(Boolean).join('\n\n'),
    // )
    const error = new Error(message);
    error.name = "TestingLibraryElementError";
    error.stack = null;

    return error;
  },
});

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
    const titleToFileName = (title) => title.replace(/[>]/g, "");
    let { parent } = runnable;
    let filename = "";
    // This while is to be able to support more than one level of parent in the screenshot name
    while (parent && parent.title) {
      filename = `${titleToFileName(parent.title)} -- ${filename}`;
      parent = parent.parent;
    }
    filename += `${titleToFileName(test.title)} (failed).png`;

    if (isCI) {
      // cypress-terminal-report
      Cypress.Mochawesome.context.forEach((ctx) => {
        addContext({ test }, ctx);
      });
    }

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
Cypress.Commands.add("addTestContext", (context) => {
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
Cypress.on("window:load", (window) => {
  const addEventListener = window.addEventListener;

  window.addEventListener = function (event) {
    if (event === "beforeunload") {
      return;
    }

    return addEventListener.apply(this, arguments);
  };
});

if (isCI) {
  // // cypress-terminal-report
  // afterEach(() => {
  //   cy.wait(50, { log: false });
  //   cy.addTestContext(Cypress.TerminalReport.getLogs("txt"));
  // });

  // Fast failure notifications
  // afterEach(() => {
  //   const testInfo = Cypress.mocha.getRunner().suite.ctx.currentTest;
  //   const isLastRetry = testInfo.currentRetry() === testInfo.retries();

  //   if (testInfo.state === "failed" && isLastRetry) {
  //     cy.task("reportCIFailure", {
  //       spec: Cypress.spec,
  //       test: Cypress.currentTest,
  //     });
  //   }
  // });

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
    xhr: {
      printBody: false,
    },
  };

  // Ensure that after plugin installation is after the afterEach handling the integration.
  require("cypress-terminal-report/src/installLogsCollector")(options);
}

beforeEach(function () {
  const isCurrentTesOss =
    this.currentTest._testConfig.unverifiedTestConfig.tags === "@OSS";
  const isBuildOss = Cypress.env("MB_EDITION") === "oss";
  const testName = this.currentTest.title;
  if (Cypress.config("isInteractive") && isCurrentTesOss && !isBuildOss) {
    console.log(
      "%cSkipping test because it is tagged with @OSS:",
      "color: red;",
    );
    console.log(`test name: ${testName}\n\n"this test should be ran against OSS jar. Make sure you have MB_EDITION=oss set and go to e2e/support/cypress.js and temporarily remove the skipOn(true) to run the test"
    `);
    cy.skipOn(true);
  }

  // enable network throttling, primarily used for stress test at CI
  if (isNetworkThrottlingEnabled) {
    cy.intercept("GET", "**", (req) => {
      req.reply((res) => {
        res.setDelay(300);
        res.setThrottle(1440); // 1.44Mb, same as slow 4g in chrome dev tools
        res.send();
      });
    }).as("globalIntercept");
  }
});
