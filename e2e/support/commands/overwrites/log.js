import { addCustomCommandStyles } from "../timeline/customStyles";

Cypress.Commands.overwrite("log", (originalFn, text) => {
  const logConfig = {
    displayName: `${window.logCalls}. ${text}`,
    name: "log",
    message: "",
  };

  addCustomCommandStyles(logConfig);
  Cypress.log(logConfig);
  window.logCalls++;
});

// We want to reset the log counter for every new test (do not remove from this file)
beforeEach(() => {
  window.logCalls = 1;
});
