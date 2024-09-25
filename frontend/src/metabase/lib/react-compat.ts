// Support React 17 backwards compatibility for the Embedding SDK

import React from "react";
import ReactDOM from "react-dom";
import { type Root, createRoot } from "react-dom/client";

import { isReactVersionLessThanOrEqualTo17 } from "./compat/check-version";

// React 18 and later has the useSyncExternalStore hook.
export const isReact17OrEarlier = () => !("useSyncExternalStore" in React);

export function renderRoot(
  content: React.JSX.Element,
  element: Element,
): Root | undefined {
  if (isReactVersionLessThanOrEqualTo17(React.version)) {
    ReactDOM.render(content, element);
    return;
  }

  const root = createRoot(element);
  root.render(content);

  return root;
}

export function unmountRoot(root?: Root, element?: Element) {
  if (isReactVersionLessThanOrEqualTo17(React.version) && element) {
    ReactDOM.unmountComponentAtNode(element);
    return;
  }

  if (root) {
    root.unmount();
  }
}
