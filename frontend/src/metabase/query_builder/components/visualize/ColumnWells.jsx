import React from "react";

import cx from "classnames";
import _ from "underscore";

import colors, { alpha } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";

import { formatColumn } from "metabase/lib/formatting";

import { updateSettings } from "metabase/visualizations/lib/settings";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

import ColumnDropTarget from "./dnd/ColumnDropTarget";

export default class ColumnWells extends React.Component {
  render() {
    const {
      question,
      style,
      className,
      children,
      rawSeries,
      onReplaceAllVisualizationSettings,
    } = this.props;

    const wells = getColumnWells(rawSeries, onReplaceAllVisualizationSettings);
    return (
      <div style={style} className={cx(className, "flex flex-row")}>
        {wells.left && (
          <WellArea vertical>
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

const getPlaceholderColorStyle = (color, opacity = 0.2) => ({
  backgroundColor: alpha(color, opacity),
  boxShadow: `0 0 0 ${WELL_BORDER}px ${alpha(color, opacity / 2)}`,
});

const WELL_PLACEHOLDER_STYLE = getPlaceholderColorStyle(colors["text-medium"]);

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

const WellArea = ({ vertical, children }) => (
  <div className={cx("flex layout-centered", { "flex-column": vertical })}>
    {children}
  </div>
);

const Well = ({ well, vertical }) => {
  return (
    <ColumnDropTarget onDrop={column => well.onAdd(column)}>
      {({ hovered, highlighted }) => (
        <span
          className={cx(
            "m3 circular p1 bg-medium h3 text-medium text-centered flex layout-centered",
            vertical ? "py2" : "px2",
          )}
          style={{
            ...(vertical ? WELL_VERTICAL_STYLE : WELL_HORIZONTAL_STYLE),
            ...(well.column
              ? { ...WELL_COLUMN_STYLE, backgroundColor: well.color }
              : WELL_PLACEHOLDER_STYLE),
            ...(hovered
              ? getPlaceholderColorStyle(colors["brand"], 0.5)
              : highlighted
                ? getPlaceholderColorStyle(colors["text-medium"], 0.5)
                : {}),
          }}
        >
          {well.column ? formatColumn(well.column) : well.placeholder}
          {well.onRemove && (
            <Icon
              name="close"
              className={cx(
                "text-light text-medium-hover cursor-pointer",
                vertical ? "my1" : "mx1",
              )}
              onClick={well.onRemove}
            />
          )}
        </span>
      )}
    </ColumnDropTarget>
  );
};

// FIMEX: lots of cleanup, extract logic into each visualization
function getColumnWells(series, onReplaceAllVisualizationSettings) {
  if (!series) {
    return {};
  }

  const display = series[0].card.display;
  const storedSettings = series[0].card.visualization_settings;
  const computedSettings = getComputedSettingsForSeries(series);
  const cols = series[0].data.cols;

  const changeSetting = (id, value) =>
    console.log(id, storedSettings[id], "=>", value) ||
    onReplaceAllVisualizationSettings(
      updateSettings(storedSettings, {
        [id]: value,
      }),
    );

  if (display === "line" || display === "area" || display === "bar") {
    console.log(
      "stored",
      storedSettings["graph.metrics"],
      storedSettings["graph.dimensions"],
    );
    console.log(
      "computed",
      computedSettings["graph.metrics"],
      computedSettings["graph.dimensions"],
    );

    const wells = {
      left: [],
      bottom: [],
    };

    for (const name of computedSettings["graph.metrics"].filter(
      n => n != null,
    )) {
      wells.left.push({
        column: _.findWhere(cols, { name }),
        color: colors["accent1"],
        onRemove: () =>
          changeSetting(
            "graph.metrics",
            computedSettings["graph.metrics"].map(n => (n === name ? null : n)),
          ),
      });
    }
    for (const name of computedSettings["graph.dimensions"].filter(
      n => n != null,
    )) {
      wells.bottom.push({
        column: _.findWhere(cols, { name }),
        color: colors["accent2"],
        onRemove: () =>
          changeSetting(
            "graph.dimensions",
            computedSettings["graph.dimensions"].map(
              n => (n === name ? null : n),
            ),
          ),
      });
    }

    // if (wells.left.length === 0) {
    wells.left.push({
      placeholder: "y",
      onAdd: column => changeSetting("graph.metrics", [column.name]),
    });
    // }
    if (wells.bottom.length === 0) {
      wells.bottom.push({
        placeholder: "x",
        onAdd: column => changeSetting("graph.dimensions", [column.name]),
      });
    } else if (wells.bottom.length === 1) {
      wells.bottom.push({
        placeholder: "Series breakout",
        onAdd: column =>
          changeSetting("graph.dimensions", [
            computedSettings["graph.dimensions"][0],
            column.name,
          ]),
      });
    }
    return wells;
  }
  return {};
}
