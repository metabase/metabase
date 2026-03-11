// Support React 17 backwards compatibility for the Embedding SDK
import type React from "react";
import ReactDOM from "react-dom";
import { type Root, createRoot } from "react-dom/client";

import { getMajorReactVersion } from "./compat/check-version";

export function renderRoot(
  content: React.JSX.Element,
  element: Element,
): Root | undefined {
  const reactVersion = getMajorReactVersion();

  if (reactVersion <= 17) {
    // eslint-disable-next-line react/no-deprecated -- legacy usage
    ReactDOM.render(content, element);
    return;
  }

  const root = createRoot(element);
  root.render(content);

  return root;
}

export function unmountRoot(root?: Root, element?: Element) {
  const reactVersion = getMajorReactVersion();

  if (reactVersion <= 17 && element) {
    // eslint-disable-next-line react/no-deprecated -- legacy usage
    ReactDOM.unmountComponentAtNode(element);
    return;
  }

  if (root) {
    root.unmount();
  }
}
