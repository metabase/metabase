Cypress.Commands.overwrite("log", (originalFn, message) => {
  Cypress.log({
    displayName: `--- ${window.logCalls}. ${message} ---`,
    name: `--- ${window.logCalls}. ${message} ---`,
    message: "",
  });

  window.logCalls++;
});

// We want to reset the log counter for every new test (do not remove from this file)
beforeEach(() => {
  window.logCalls = 1;
});
