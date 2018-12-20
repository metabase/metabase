import React from "react";

import cx from "classnames";
import _ from "underscore";

import colors, { alpha } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

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
      query,
      setDatasetQuery,
      setQuestion,
      onReplaceAllVisualizationSettings,
    } = this.props;

    let wells;
    let onChangeSettings;
    let computedSettings = {};
    if (rawSeries) {
      const storedSettings = rawSeries[0].card.visualization_settings;
      computedSettings = getComputedSettingsForSeries(rawSeries);

      wells = computedSettings["_column_wells"];
      onChangeSettings = changedSettings => {
        onReplaceAllVisualizationSettings(
          updateSettings(storedSettings, changedSettings),
        );
      };
    }

    // TODO: push this binding up to QueryBuilder
    const boundQuestion = question.bindUpdate(q => setQuestion(q, true));

    const actionProps = {
      settings: computedSettings,
      onChangeSettings: onChangeSettings,
      query: boundQuestion.query(),
      onChangeDatasetQuery: setDatasetQuery,
      series: rawSeries,

      question: boundQuestion,
    };

    window.q = boundQuestion;

    return (
      <div style={style} className={cx(className, "flex flex-row")}>
        {wells &&
          wells.left && (
            <WellArea vertical>
              {wells.left.map(well => (
                <Well vertical well={well} actionProps={actionProps} />
              ))}
            </WellArea>
          )}
        <div className="flex-full flex flex-column">
          {children}
          {wells &&
            wells.bottom && (
              <WellArea>
                {wells.bottom.map(well => (
                  <Well well={well} actionProps={actionProps} />
                ))}
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
  // minHeight: WELL_MIN_WIDTH,
};

const WELL_HORIZONTAL_STYLE = {
  // minWidth: WELL_MIN_WIDTH,
};

const WellArea = ({ vertical, children }) => (
  <div
    className={cx("flex layout-centered", { "flex-column-reverse": vertical })}
  >
    {children}
  </div>
);

const Well = ({ well, vertical, actionProps }) => {
  const { query } = actionProps;
  return (
    <ColumnDropTarget
      canDrop={item => well.canAdd && well.canAdd(item)}
      onDrop={item => well.onAdd(item, actionProps)}
    >
      {({ hovered, highlighted }) => {
        const trigger = (
          <span
            className={cx(
              "m3 circular p1 bg-medium h3 text-medium text-centered flex layout-centered",
              vertical ? "py3" : "px3",
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
            {well.dimension
              ? well.dimension.displayName()
              : well.column ? formatColumn(well.column) : well.placeholder}
            {well.onRemove && (
              <Icon
                name="close"
                className={cx(
                  "text-light text-medium-hover cursor-pointer",
                  vertical ? "mt1" : "ml1",
                )}
                onClick={() => well.onRemove(actionProps)}
              />
            )}
          </span>
        );
        if (well.renderPopover) {
          return (
            <PopoverWithTrigger triggerElement={trigger}>
              {({ onClose }) => well.renderPopover({ onClose, ...actionProps })}
            </PopoverWithTrigger>
          );
        } else {
          return trigger;
        }
      }}
    </ColumnDropTarget>
  );
};
