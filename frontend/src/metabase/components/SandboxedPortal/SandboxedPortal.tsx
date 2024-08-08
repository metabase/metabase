import ReactDOM from "react-dom";

import EventSandbox from "metabase/components/EventSandbox";

import type { EventSandboxProps } from "../EventSandbox/EventSandbox";

// Prevent DOM events from bubbling through the React component tree
// See https://reactjs.org/docs/portals.html#event-bubbling-through-portals
const SandboxedPortal = ({
  children,
  container,
  ...props
}: {
  children: React.ReactNode;
  container: Element;
} & EventSandboxProps) => {
  return ReactDOM.createPortal(
    <EventSandbox {...props}>{children}</EventSandbox>,
    container,
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SandboxedPortal;
