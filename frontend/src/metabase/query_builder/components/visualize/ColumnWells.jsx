import React from "react";

import cx from "classnames";

import colors, { alpha } from "metabase/lib/colors";

export default class ColumnWells extends React.Component {
  render() {
    const { question, settings, style, className, children } = this.props;

    const wells = getColumnWells(question, settings);
    return (
      <div style={style} className={cx(className, "flex flex-row")}>
        {wells.left && (
          <WellArea>
            {wells.left.map(well => <Well vertical well={well} />)}
          </WellArea>
        )}
        <div className="flex-full flex flex-column">
          {children}
          {wells.bottom && (
            <WellArea>
              {wells.bottom.map(well => <Well well={well} />)}
            </WellArea>
          )}
        </div>
      </div>
    );
  }
}

const WELL_MIN_WIDTH = 180;
const WELL_BORDER = 10;

const WELL_STYLE = {
  backgroundColor: alpha(colors["text-medium"], 0.2),
  boxShadow: `0 0 0 ${WELL_BORDER}px ${alpha(colors["text-medium"], 0.1)}`,
};

// FIXME: ensure browser compatibility
const WELL_VERTICAL_STYLE = {
  ...WELL_STYLE,
  writingMode: "vertical-rl",
  transform: "rotate(180deg)",
  whiteSpace: "nowrap",
  display: "inline-block",
  overflow: "visible",
  minHeight: WELL_MIN_WIDTH,
};

const WELL_HORIZONTAL_STYLE = {
  ...WELL_STYLE,
  minWidth: WELL_MIN_WIDTH,
};

const WellArea = ({ children }) => (
  <div className="flex layout-centered">{children}</div>
);

const Well = ({ well, vertical }) => (
  <span
    className={cx(
      "m3 circular p1 bg-medium h3 text-medium text-centered",
      vertical ? "py2" : "px2",
    )}
    style={vertical ? WELL_VERTICAL_STYLE : WELL_HORIZONTAL_STYLE}
  >
    {well.placeholder}
  </span>
);

function getColumnWells(question, settings) {
  const display = question.display();
  if (display === "line" || display === "area" || display === "bar") {
    return {
      left: [{ placeholder: "y" }],
      bottom: [{ placeholder: "x" }],
    };
  }
  return {};
}
