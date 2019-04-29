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
    <div>
      <div className="flex px4 pt3 pb2">
        <h3 className="text-heavy ">{t`How do you want to view this data?`}</h3>
        <Icon
          name="close"
          className="flex-align-right text-medium text-brand-hover cursor-pointer"
          onClick={() =>
            setUIControls({
              isShowingChartTypeSidebar: false, // TODO: move to reducer?
            })
          }
          size={20}
        />
      </div>
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
    className={cx("m1 flex flex-column layout-centered cursor-pointer", {
      "text-white bg-brand": isSelected,
      "text-dark bg-medium-hover": !isSelected,
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
