import CS from "metabase/css/core/index.css";
import {
  ChartTypeSettings,
  useQuestionVisualizationState,
} from "metabase/query_builder/components/chart-type-selector";
import type { CardDisplayType } from "metabase-types/api";

import { useChartTypeSelectors } from "../hooks/use-chart-type-selectors";
import { Button, Group, Icon, IconName, Menu, Select, Text } from "metabase/ui";
import { forwardRef, useState } from "react";
import { checkNotNull } from "metabase/lib/types";
import visualizations from "metabase/visualizations";
import { VisualizationDisplay } from "metabase-types/api";

export const ChartTypeSelectorList = () => {
  // const {
  // selectedVisualization,
  // updateQuestionVisualization,
  // sensibleVisualizations,
  // nonSensibleVisualizations,
  // } = useChartTypeSelectors();

  const [selectedVisualization, setSelectedVisualization] =
    useState<VisualizationDisplay>("table");

  const values = [
    ...[
      "table",
      "bar",
      "line",
      "pie",
      "scalar",
      "row",
      "area",
      "combo",
      "pivot",
      "smartscalar",
      "gauge",
      "progress",
      "funnel",
      "object",
      "map",
      "scatter",
      "waterfall",
    ].map(visualizationType => {
      const visualization = visualizations.get(visualizationType);
      return {
        value: visualizationType,
        label: visualizationType, // visualization.uiName,
        group: "Sensible",
        iconName: visualizationType,
      };
    }),
    ...[
      "table",
      "bar",
      "line",
      "pie",
      "scalar",
      "row",
      "area",
      "combo",
      "pivot",
      "smartscalar",
      "gauge",
      "progress",
      "funnel",
      "object",
      "map",
      "scatter",
      "waterfall",
    ].map(visualizationType => {
      const visualization = visualizations.get(visualizationType);
      return {
        value: visualizationType,
        label: visualizationType, // visualization.uiName,
        group: "Nonsensible",
        iconName: visualizationType,
      };
    }),
  ];

  return (
    <Menu>
      <Menu.Target>
        <Button>
          <Group>
            <Icon name={selectedVisualization} />
            <Text>{selectedVisualization}</Text>
          </Group>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {values.map(({ value, iconName }, index) => (
          <Menu.Item
            key={`${value}/${index}`}
            onClick={() => setSelectedVisualization(value)}
            
            icon={
              <Icon
                name={iconName}
              />
            }
          >
            {value}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};

export const ChartTypeSelector = ({
  onChange,
}: {
  onChange?: (display: CardDisplayType) => void;
}) => {
  const {
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  } = useChartTypeSelectors();

  return (
    <ChartTypeSettings
      w="20rem"
      p="xl"
      h="100%"
      className={CS.overflowYScroll}
      sensibleVisualizations={sensibleVisualizations}
      nonSensibleVisualizations={nonSensibleVisualizations}
      selectedVisualization={selectedVisualization}
      onSelectVisualization={(display: CardDisplayType) => {
        onChange?.(display);
        updateQuestionVisualization(display);
      }}
    />
  );
};
