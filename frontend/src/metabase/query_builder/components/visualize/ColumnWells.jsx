import React from "react";

import cx from "classnames";
import _ from "underscore";

import colors, { alpha } from "metabase/lib/colors";

import { formatColumn } from "metabase/lib/formatting";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

export default class ColumnWells extends React.Component {
  render() {
    const { question, style, className, children, rawSeries } = this.props;

    const wells = getColumnWells(rawSeries);
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

const WELL_COLUMN_STYLE = {
  backgroundColor: colors["brand"],
  color: colors["text-white"],
};

const WELL_PLACEHOLDER_STYLE = {
  backgroundColor: alpha(colors["text-medium"], 0.2),
  boxShadow: `0 0 0 ${WELL_BORDER}px ${alpha(colors["text-medium"], 0.1)}`,
};

const WELL_VERTICAL_STYLE = {
  // FIXME: ensure browser compatibility
  writingMode: "vertical-rl",
  transform: "rotate(180deg)",
  whiteSpace: "nowrap",
  display: "inline-block",
  overflow: "visible",
  minHeight: WELL_MIN_WIDTH,
};

const WELL_HORIZONTAL_STYLE = {
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
    style={{
      ...(vertical ? WELL_VERTICAL_STYLE : WELL_HORIZONTAL_STYLE),
      ...(well.column
        ? { ...WELL_COLUMN_STYLE, backgroundColor: well.color }
        : WELL_PLACEHOLDER_STYLE),
    }}
  >
    {well.column ? formatColumn(well.column) : well.placeholder}
  </span>
);

function getColumnWells(series) {
  if (!series) {
    return {};
  }

  const display = series[0].card.display;
  const settings = getComputedSettingsForSeries(series);
  const cols = series[0].data.cols;

  if (display === "line" || display === "area" || display === "bar") {
    const wells = {
      left: [],
      bottom: [],
    };
    for (const name of settings["graph.metrics"]) {
      wells.left.push({
        column: _.findWhere(cols, { name }),
        color: colors["accent1"],
      });
    }
    for (const name of settings["graph.dimensions"]) {
      wells.bottom.push({
        column: _.findWhere(cols, { name }),
        color: colors["accent2"],
      });
    }
    if (wells.left.length === 0) {
      wells.left.push({ placeholder: "y" });
    }
    if (wells.bottom.length === 0) {
      wells.bottom.push({ placeholder: "x" });
    }
    if (wells.bottom.length === 1) {
      wells.bottom.push({ placeholder: "Series breakout" });
    }
    return wells;
  }
  return {};
}
