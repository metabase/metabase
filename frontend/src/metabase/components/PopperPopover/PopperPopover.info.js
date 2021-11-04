/* eslint-disable react/prop-types */
import React, { useRef } from "react";

import PopperPopover from "./PopperPopover";

export const component = PopperPopover;
export const description = "Wrapper around react-popper";

const style = {
  border: "1px solid black",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function Demo({ variant }) {
  return (
    <div style={{ ...style, width: 1000 }}>
      <PopperPopover
        renderTarget={ref => {
          return (
            <div ref={ref} style={{ ...style, width: 100, height: 100 }}>
              popover target
            </div>
          );
        }}
        renderContent={ref => {
          return (
            <div
              ref={ref}
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
      />
    </div>
  );
}

export const examples = {
  "vertical variant": <Demo variant="vertical" />,
  spacer: <div style={{ height: 250, width: 1000 }} />,
  "horizontal variant": <Demo variant="horizontal" />,
};
