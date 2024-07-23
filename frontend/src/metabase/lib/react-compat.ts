// Support React 17 backwards compatibility for the Embedding SDK

import React from "react";
import ReactDOM from "react-dom";
import { createRoot, type Root } from "react-dom/client";

function isReact17() {
  const versionParts = React.version.split(".");

  if (versionParts.length < 1) {
    return false;
  }

  const majorVersion = parseInt(versionParts[0], 10);

  if (isNaN(majorVersion)) {
    return false;
  }

  return majorVersion <= 17;
}

export function renderRoot(
  content: React.JSX.Element,
  element: Element,
): Root | undefined {
  if (isReact17()) {
    // Support backwards compatibility with React 17 for the embedding SDK.
    ReactDOM.render(content, element);
    return;
  }

  const root = createRoot(element);
  root.render(content);

  return root;
}

export function unmountRoot(root?: Root, element?: Element) {
  if (isReact17() && element) {
    ReactDOM.unmountComponentAtNode(element);
    return;
  }

  if (root) {
    root.unmount();
  }
}
