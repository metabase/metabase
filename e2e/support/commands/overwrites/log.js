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
  const doc = window.top.document;
  const headHTML = doc.head;
  const styleId = "customLogStyle";
  const customStyle = doc.getElementById(styleId);
  const bgColor = "#7f43c9";

  if (!customStyle) {
    const style = document.createElement("style");

    style.textContent = `
    .command-name-${logConfig.name} .command-pin-target{
      color: #ffffff !important;
      background-color: ${bgColor} !important;
      font-weight: bold !important;
    }
    `;
    style.type = "text/css";
    style.id = styleId;

    headHTML.append(style);
  }
}
