import React from "react";
import cx from "classnames";
import _ from "underscore";
import { t } from "c-3po";

import Icon from "metabase/components/Icon";

import visualizations from "metabase/visualizations";

const FIXED_LAYOUT = [
  ["table"],
  ["line", "bar", "combo", "area"],
  ["scatter", "row", "pie", "funnel"],
  ["scalar", "smartscalar", "progress", "gauge"],
  ["map"],
];
const FIXED_TYPES = new Set(_.flatten(FIXED_LAYOUT));

const ChartTypeSidebar = ({
  question,
  result,
  onOpenChartSettings,
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
    <div>
      <h3 className="px4 pt3 pb2">How do you want to view this data?</h3>
      {layout.map(row => (
        <div className="flex justify-between border-row-divider py1 pl2 pr3">
          {row.map(type => {
            const visualization = visualizations.get(type);
            return (
              visualization && (
                <ChartTypeOption
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
    className={cx("m1 flex flex-column layout-centered", {
      "text-white bg-brand": isSelected,
      "text-dark cursor-pointer bg-medium-hover": !isSelected,
    })}
    style={{
      width: 60,
      height: 60,
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
