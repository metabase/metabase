/* eslint-disable react/prop-types */
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

function Demo({ placement }) {
  return (
    <div style={{ ...style, width: 1000 }}>
      <TippyPopover
        visible
        placement={placement}
        render={() => {
          return (
            <div
              style={{
                ...style,
                backgroundColor: "white",
                height: 300,
                width: 300,
              }}
            >
              popover body
            </div>
          );
        }}
      >
        <div style={{ ...style, width: 100, height: 100 }}>popover target</div>
      </TippyPopover>
    </div>
  );
}

export const examples = {
  "vertical placement": <Demo placement="top" />,
  spacer: <div style={{ height: 250, width: 1000 }} />,
  "horizontal placement": <Demo placement="left" />,
};
