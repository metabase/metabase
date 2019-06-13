import React from "react";
import _ from "underscore";
import { t } from "ttag";
import cx from "classnames";
import { Box, Flex } from "grid-styled";
import Icon from "metabase/components/Icon";
import SidebarContent from "metabase/query_builder/components/view/SidebarContent";

import colors from "metabase/lib/colors";

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
      onClose={onCloseChartType}
    >
      {layout.map(row => (
        <Flex py={2} mx={3} mb={1} className="flex-wrap">
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
      p={[1, 2]}
      flexDirection="column"
      align="center"
      justifyContent="center"
      bg={isSelected ? colors["brand"] : "#D8ECFF"}
      onClick={onClick}
      className={cx(
        "cursor-pointer bg-brand-hover text-brand text-white-hover",
        { "text-white": isSelected },
      )}
      style={{
        height: 70,
        borderRadius: 18,
      }}
    >
      <Icon name={visualization.iconName} size={24} />
    </Flex>
    <Box mt={1} className="text-bold text-brand">
      {visualization.uiName}
    </Box>
  </Box>
);

export default ChartTypeSidebar;
