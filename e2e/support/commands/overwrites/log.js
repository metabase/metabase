Cypress.Commands.overwrite("log", (originalFn, text) => {
  const logConfig = {
    displayName: `${window.logCalls}. ${text}`,
    name: "log",
    message: "",
  };

  appendStyleIfNotExists(logConfig);
  Cypress.log(logConfig);
  window.logCalls++;
});

// We want to reset the log counter for every new test (do not remove from this file)
beforeEach(() => {
  window.logCalls = 1;
});

function appendStyleIfNotExists(logConfig) {
  const headHTML = Cypress.$(window.top.document.head);
  const allStyles = Array.from(Cypress.$(window.top.document.styleSheets));

  const getCustomStyle = allStyles.filter(s => s.ownerNode.dataset.customLog);
  const customStyleExists = getCustomStyle.length > 0;

  if (!customStyleExists) {
    const style = document.createElement("style");

    style.textContent = `
      .command-name-${logConfig.name} .command-pin-target{
        color: #ffffff !important;
        background-color: #7f43c9 !important;
        font-weight: bold !important;
      }
    `;
    style.type = "text/css";
    style.dataset.customLog = true;

    headHTML.append(style);
  }
}
