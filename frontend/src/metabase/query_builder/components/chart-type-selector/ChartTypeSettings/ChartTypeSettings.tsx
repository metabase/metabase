import { t } from "ttag";

import { Space, Stack, type StackProps, Text } from "metabase/ui";

import { ChartTypeList, type ChartTypeListProps } from "../ChartTypeList";

export type ChartTypeSettingsProps = {
  sensibleVisualizations: ChartTypeListProps["visualizationList"];
  nonSensibleVisualizations: ChartTypeListProps["visualizationList"];
} & Pick<
  ChartTypeListProps,
  "selectedVisualization" | "onSelectVisualization"
> &
  StackProps;

export const ChartTypeSettings = ({
  selectedVisualization,
  onSelectVisualization,
  sensibleVisualizations,
  nonSensibleVisualizations,
  ...stackProps
}: ChartTypeSettingsProps) => (
  <Stack data-testid="chart-type-settings" {...stackProps}>
    <ChartTypeList
      data-testid="display-options-sensible"
      visualizationList={sensibleVisualizations}
      onSelectVisualization={onSelectVisualization}
      selectedVisualization={selectedVisualization}
    />

    <Space h="xl" />

    <Text
      fw="bold"
      color="text-medium"
      tt="uppercase"
      fz="sm"
    >{t`Other charts`}</Text>

    <Space h="sm" />

    <ChartTypeList
      data-testid="display-options-not-sensible"
      visualizationList={nonSensibleVisualizations}
      onSelectVisualization={onSelectVisualization}
      selectedVisualization={selectedVisualization}
    />
  </Stack>
);
