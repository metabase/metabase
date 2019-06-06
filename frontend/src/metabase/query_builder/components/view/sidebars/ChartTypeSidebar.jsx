import React from "react";
import cx from "classnames";
import _ from "underscore";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import SidebarContent from "metabase/query_builder/components/view/SidebarContent";

import visualizations from "metabase/visualizations";

const FIXED_LAYOUT = [
  ["line", "bar", "combo", "area"],
  ["scatter", "row", "pie", "funnel"],
  ["scalar", "smartscalar", "progress", "gauge"],
  ["table", "map"],
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
    <SidebarContent
      className="full-height"
      title={t`Choose a visualization`}
      onClose={() =>
        setUIControls({
          isShowingChartTypeSidebar: false, // TODO: move to reducer
        })
      }
    >
      {layout.map(row => (
        <div className="flex border-row-divider py2 px3">
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
    </SidebarContent>
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
