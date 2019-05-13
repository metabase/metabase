import React from "react";
import cx from "classnames";
import _ from "underscore";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";

import visualizations from "metabase/visualizations";

const FIXED_LAYOUT = [
  ["table", "map"],
  ["scalar", "smartscalar", "progress", "gauge"],
  ["scatter", "row", "pie", "funnel"],
  ["line", "bar", "combo", "area"],
];
const FIXED_TYPES = new Set(_.flatten(FIXED_LAYOUT));

const ChartTypeSidebar = ({
  question,
  result,
  onOpenChartSettings,
  setUIControls,
  isShowingChartTypeSidebar,
  ...props
}) => {
  const other = Array.from(visualizations)
    .filter(
      ([type, visualization]) =>
        !visualization.hidden && !FIXED_TYPES.has(type),
    )
    .map(([type]) => type);
  const otherGrouped = Object.values(
    _.groupBy(other, (_, index) => Math.floor(index / 4)),
  );

  const layout = [...FIXED_LAYOUT, ...otherGrouped];

  return (
    <div className="absolute bottom scroll-y" style={{width: 420}}>
      {layout.map(row => (
        <div className="flex border-row-divider py2 px4">
          {row.map(type => {
            const visualization = visualizations.get(type);
            return (
              visualization && (
                <ChartTypeOption
                  className="mx2"
                  visualization={visualization}
                  isSelected={type === question.display()}
                  isSensible={
                    result &&
                    result.data &&
                    visualization.isSensible &&
                    visualization.isSensible(result.data)
                  }
                  onClick={() => {
                    question.setDisplay(type).update(null, { reload: false });
                    onOpenChartSettings({ section: t`Data` });
                  }}
                />
              )
            );
          })}
        </div>
      ))}
      <div className="flex align-center px4 py2 bg-brand">
        <h3 className="text-heavy text-white">{t`Choose a visualization`}</h3>
        <Button
          white
          className="flex-align-right"
          onClick={() =>
            setUIControls({
              isShowingChartTypeSidebar: false, // TODO: move to reducer
            })
          }
        >
          {t`Done`}
        </Button>
      </div>
    </div>
  );
};

const ChartTypeOption = ({
  visualization,
  isSelected,
  isSensible,
  onClick,
}) => (
  <div
    onClick={onClick}
    className={cx("m1 flex flex-column layout-centered cursor-pointer", {
      "text-white bg-brand": isSelected,
      "text-dark bg-medium-hover": !isSelected,
    })}
    style={{
      width: 70,
      height: 70,
      borderRadius: 8,
      opacity: !isSensible ? 0.35 : 1,
    }}
  >
    <Icon
      className={isSelected ? "text-white" : "text-medium"}
      name={visualization.iconName}
      size={20}
    />
    <span className="text-bold mt1">{visualization.uiName}</span>
  </div>
);

export default ChartTypeSidebar;
