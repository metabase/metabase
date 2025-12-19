import { t } from "ttag";

import { Space, Stack, type StackProps, Text } from "metabase/ui";

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
}: ChartTypeSettingsProps) => (
  <Stack data-testid="chart-type-settings" {...stackProps}>
    <ChartTypeList
      data-testid="display-options-sensible"
      visualizationList={sensibleVisualizations}
      onSelectVisualization={onSelectVisualization}
      selectedVisualization={selectedVisualization}
      onOpenSettings={onOpenSettings}
    />

    <Space h="xl" />

    <Text
      fw="bold"
      color="text-secondary"
      tt="uppercase"
      fz="sm"
    >{t`Other charts`}</Text>

    <Space h="sm" />

    <ChartTypeList
      data-testid="display-options-not-sensible"
      visualizationList={nonSensibleVisualizations}
      onSelectVisualization={onSelectVisualization}
      selectedVisualization={selectedVisualization}
      onOpenSettings={onOpenSettings}
    />
  </Stack>
);
