import { useState } from "react";
import { t } from "ttag";

import {
  Collapse,
  Group,
  Icon,
  Space,
  Stack,
  type StackProps,
  Text,
  UnstyledButton,
} from "metabase/ui";

import { ChartTypeList, type ChartTypeListProps } from "../ChartTypeList";

export type ChartTypeSettingsProps = {
  sensibleVisualizations: ChartTypeListProps["visualizationList"];
  nonSensibleVisualizations: ChartTypeListProps["visualizationList"];
} & Pick<
  ChartTypeListProps,
  "selectedVisualization" | "onSelectVisualization" | "onOpenSettings"
> &
  StackProps;

export const ChartTypeSettings = ({
  selectedVisualization,
  onSelectVisualization,
  sensibleVisualizations,
  nonSensibleVisualizations,
  onOpenSettings,
  ...stackProps
}: ChartTypeSettingsProps) => {
  const [isExpanded, setIsExpanded] = useState(
    nonSensibleVisualizations.includes(selectedVisualization),
  );

  return (
    <Stack data-testid="chart-type-settings" {...stackProps}>
      <ChartTypeList
        data-testid="display-options-sensible"
        visualizationList={sensibleVisualizations}
        onSelectVisualization={onSelectVisualization}
        selectedVisualization={selectedVisualization}
        onOpenSettings={onOpenSettings}
      />

      <Space h="xl" />

      <Group
        component={UnstyledButton}
        gap="xs"
        onClick={() => setIsExpanded(prev => !prev)}
        data-testid="more-charts-toggle"
      >
        <Text
          fw="bold"
          color="text-secondary"
          tt="uppercase"
          fz="sm"
        >{t`More charts`}</Text>
        <Icon
          name={isExpanded ? "chevronup" : "chevrondown"}
          color="text-secondary"
          size={10}
        />
      </Group>

      <Collapse in={isExpanded}>
        <Space h="sm" />
        <ChartTypeList
          data-testid="display-options-not-sensible"
          visualizationList={nonSensibleVisualizations}
          onSelectVisualization={onSelectVisualization}
          selectedVisualization={selectedVisualization}
          onOpenSettings={onOpenSettings}
        />
      </Collapse>
    </Stack>
  );
};
