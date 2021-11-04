/* eslint-disable react/prop-types */
import React, { useRef } from "react";

import TetherPopover from "./TetherPopover";

export const component = TetherPopover;
export const description = "Simple React wrapper around Tether";

const style = {
  border: "1px solid black",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function Demo({ variant }) {
  const constraints = [
    {
      to: "window",
      attachment: "together",
    },
  ];

  const tetherOptions =
    variant === "vertical"
      ? {
          constraints,
          attachment: "top left",
          targetAttachment: "bottom left",
        }
      : {
          constraints,
          attachment: "center right",
          targetAttachment: "center left",
        };

  return (
    <div style={{ ...style, width: 1000 }}>
      <TetherPopover
        variant={variant}
        tetherOptions={tetherOptions}
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
