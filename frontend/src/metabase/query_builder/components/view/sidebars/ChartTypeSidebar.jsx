import React from "react";
import _ from "underscore";
import { t } from "ttag";
import cx from "classnames";
import { Box, Flex } from "grid-styled";
import Icon from "metabase/components/Icon";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

import { color, lighten } from "metabase/lib/colors";

import visualizations from "metabase/visualizations";

const FIXED_LAYOUT = [
  ["line", "bar", "combo", "area", "row"],
  ["scatter", "pie", "funnel", "smartscalar", "progress", "gauge"],
  ["scalar", "table", "map"],
];
const FIXED_TYPES = new Set(_.flatten(FIXED_LAYOUT));

const ChartTypeSidebar = ({
  question,
  result,
  onOpenChartSettings,
  onCloseChartType,
  isShowingChartTypeSidebar,
  setUIControls,
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
      className="full-height px1"
      title={t`Choose a visualization`}
      onDone={onCloseChartType}
    >
      {layout.map(row => (
        <Flex mx={2} mb={1} className="flex-wrap">
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
                    question
                      .setDisplay(type)
                      .lockDisplay(true) // prevent viz auto-selection
                      .update(null, { reload: false, shouldUpdateUrl: true });
                    onOpenChartSettings({ section: t`Data` });
                    setUIControls({ isShowingRawTable: false });
                  }}
                />
              )
            );
          })}
        </Flex>
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
  <Box
    p={1}
    w={1 / 3}
    className="text-centered"
    style={{ opacity: !isSensible ? 0.25 : 1 }}
  >
    <Flex
      flexDirection="column"
      align="center"
      justifyContent="center"
      bg={isSelected ? color("brand") : lighten("brand")}
      onClick={onClick}
      className={cx(
        "cursor-pointer bg-brand-hover text-brand text-white-hover",
        { "text-white": isSelected },
      )}
      style={{
        borderRadius: 10,
        padding: 12,
      }}
    >
      <Icon name={visualization.iconName} size={20} />
    </Flex>
    <Box mt={1} className="text-bold text-brand">
      {visualization.uiName}
    </Box>
  </Box>
);

export default ChartTypeSidebar;
