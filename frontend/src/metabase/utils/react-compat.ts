// Support React 17 backwards compatibility for the Embedding SDK
import React from "react";
import ReactDOM from "react-dom";
import { type Root, createRoot } from "react-dom/client";

// React 17 back-compat: `render` and `unmountComponentAtNode` were removed from
// the react-dom v18+ types but still exist at runtime on a React 17 host.
const legacyReactDOM = ReactDOM as unknown as {
  render: (content: React.JSX.Element, element: Element) => void;
  unmountComponentAtNode: (element: Element) => void;
};

export function renderRoot(
  content: React.JSX.Element,
  element: Element,
): Root | undefined {
  const reactVersion = getMajorReactVersion();

  if (reactVersion <= 17) {
    legacyReactDOM.render(content, element);
    return;
  }

  const root = createRoot(element);
  root.render(content);

  return root;
}

export function unmountRoot(root?: Root, element?: Element) {
  const reactVersion = getMajorReactVersion();

  if (reactVersion <= 17 && element) {
    legacyReactDOM.unmountComponentAtNode(element);
    return;
  }

  if (root) {
    root.unmount();
  }
}

export const getMajorReactVersion = () => {
  const versionParts = React.version.split(".").map(Number);

  return versionParts[0];
};
