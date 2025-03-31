import "./cypress";

import {
  countConsoleErrors,
  getErrorSummary,
  hasConsoleErrors,
  resetConsoleErrorCounters,
} from "./console-errors";

beforeEach(function () {
  resetConsoleErrorCounters();

  cy.window().then((win) => {
    cy.stub(win.console, "error")
      .as("consoleError")
      .callsFake((msg, ...args) => {
        // Count the error
        console.log("COUNTING ERROR", msg, ...args);
        countConsoleErrors([msg, ...args]);

        // Call original console.error
        win.console.error.wrappedMethod.apply(win.console, [msg, ...args]);
      });
  });
});

afterEach(function () {
  console.log("AFTER EACH");
  console.log({
    hasConsoleErrors: hasConsoleErrors(),
    errorSummary: getErrorSummary(),
  });
  if (this.currentTest.state === "failed") {
    return;
  }

  if (hasConsoleErrors()) {
    const summary = getErrorSummary();
    cy.fail(summary);
  }
});
