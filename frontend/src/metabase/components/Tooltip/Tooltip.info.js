import React from "react";
import Tooltip from "./Tooltip";

export const component = Tooltip;

export const description = `
Add context to a target element.
`;

const jsxContent = (
  <React.Fragment>
    <div style={{ backgroundColor: "blue", opacity: "50%" }}>
      blah blah blah
    </div>
    <div style={{ backgroundColor: "red", opacity: "50%" }}>blah blah blah</div>
  </React.Fragment>
);

function ReferenceTargetDemo() {
  const [target, setTarget] = React.useState();

  const onMouseEnter = () => {
    setTarget(document.getElementById("reference-target"));
  };

  const onMouseLeave = () => {
    setTarget(null);
  };

  return (
    <span>
      <a
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className="link"
      >
        Hover on me
      </a>{" "}
      <span id="reference-target" style={{ backgroundColor: "yellow" }}>
        target
      </span>
      <Tooltip
        isOpen={!!target}
        reference={target}
        tooltip="reference tooltip"
      />
    </span>
  );
}

export const examples = {
  default: (
    <Tooltip tooltip="Action">
      <a className="link">Hover on me</a>
    </Tooltip>
  ),
  longerString: (
    <Tooltip tooltip="This does an action that needs some explaining">
      <a className="link">Hover on me</a>
    </Tooltip>
  ),
  "changeable maxWidth": (
    <Tooltip
      maxWidth="unset"
      tooltip="This does an action that needs some explaining and you will see that it does not wrap"
    >
      <a className="link">Hover on me</a>
    </Tooltip>
  ),
  controllable: (
    <Tooltip isOpen tooltip="this tooltip is always open">
      <a className="link">Hover on me</a>
    </Tooltip>
  ),
  "jsx content": (
    <Tooltip tooltip={jsxContent}>
      <a className="link">Hover on me</a>
    </Tooltip>
  ),
  "reference element": <ReferenceTargetDemo />,
};
