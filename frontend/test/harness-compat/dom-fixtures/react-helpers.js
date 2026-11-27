// Shared by the fixtures that leave React stuck and the one that runs after
// them. Not a fixture itself.
const fs = require("node:fs");
const path = require("node:path");
const { Component, act, createElement, useEffect } = require("react");
const { createRoot } = require("react-dom/client");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function ThrowingEffect() {
  useEffect(() => {
    throw new Error("effect error");
  });
  return null;
}

// Each retry throws again from a passive effect, until React's handling of
// that error fails inside its own commit.
let attempts = 0;
class RetryingBoundary extends Component {
  state = { attempt: 0 };
  static getDerivedStateFromError() {
    attempts += 1;
    return { attempt: attempts };
  }
  render() {
    return createElement(ThrowingEffect, { key: this.state.attempt });
  }
}

function renderInto(element) {
  const container = document.createElement("div");
  act(() => createRoot(container).render(element));
  return container;
}

function leaveReactStuck() {
  renderInto(createElement(RetryingBoundary));
}

function renderParagraph() {
  return renderInto(createElement("p", null, "ok")).textContent;
}

// The compat spec reads this log to check the order of the files and the
// process that ran each one.
function recordRun(file) {
  const log = process.env.HARNESS_COMPAT_RUN_LOG;
  if (log) {
    fs.appendFileSync(log, `${path.basename(file)} ${process.pid}\n`);
  }
}

module.exports = {
  leaveReactStuck,
  recordRun,
  renderInto,
  renderParagraph,
};
