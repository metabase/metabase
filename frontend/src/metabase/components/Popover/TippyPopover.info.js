import React from "react";

import TippyPopover from "./TippyPopover";

export const component = TippyPopover;
export const description = "Wrapper around react-popper";

const style = {
  border: "1px solid black",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const content = (
  <div
    style={{
      ...style,
      border: "none",
      height: 200,
      width: 200,
    }}
  >
    popover body
  </div>
);

function Content() {
  const [opacity, setOpacity] = React.useState(0.1);
  const timeout = React.useRef();

  React.useEffect(() => {
    timeout.current = setTimeout(() => {
      setOpacity(1);
    }, 1000);

    return () => {
      clearTimeout(timeout.current);
    };
  }, [opacity]);

  return (
    <div
      style={{
        ...style,
        border: "none",
        height: 200,
        width: 200,
        transition: "opacity 1s",
        opacity,
      }}
    >
      popover content
    </div>
  );
}

export const examples = {
  "vertical placement": (
    <TippyPopover placement="top-start" content={content}>
      <div style={{ ...style, width: 100, height: 100 }}>popover target</div>
    </TippyPopover>
  ),
  "horizontal placement": (
    <TippyPopover placement="left-end" content={content}>
      <div style={{ ...style, width: 100, height: 100 }}>popover target</div>
    </TippyPopover>
  ),
  "lazy content rendering": (
    <React.Fragment>
      <TippyPopover placement="left-end" content={<Content />}>
        <div style={{ ...style, width: 100, height: 100 }}>lazy target</div>
      </TippyPopover>
      <TippyPopover lazy={false} placement="left-end" content={<Content />}>
        <div style={{ ...style, width: 100, height: 100 }}>not lazy target</div>
      </TippyPopover>
    </React.Fragment>
  ),
  interactive: (
    <TippyPopover interactive placement="left-end" content={content}>
      <div style={{ ...style, width: 100, height: 100 }}>popover target</div>
    </TippyPopover>
  ),
};
