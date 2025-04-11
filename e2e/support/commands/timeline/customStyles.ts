const doc = window.top?.document;
const styleId = "customLogStyle";
const customStyle = doc?.getElementById(styleId);

function appendStyleIfNotExists() {
  const headHTML = doc?.head;

  if (!customStyle) {
    const style = document.createElement("style");

    style.textContent = `
    .command-name-then, .command-name-end-logGroup {
      display: none !important;
    }
    `;
    style.type = "text/css";
    style.id = styleId;

    headHTML?.append(style);
  }
}

type LogConfig = {
  name: string;
  displayName: string;
  message: string | string[];
};

export function addCustomCommandStyles(logConfig: LogConfig) {
  const bgColor = "#7f43c9";

  if (customStyle) {
    customStyle.textContent += `
  .command-name-${logConfig.name} .command-pin-target{
    color: #ffffff !important;
    background-color: ${bgColor} !important;
    font-weight: bold !important;
  }
  `;
  }
}

before(() => {
  appendStyleIfNotExists();
});
