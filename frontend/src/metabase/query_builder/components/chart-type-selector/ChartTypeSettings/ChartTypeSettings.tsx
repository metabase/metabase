import { t } from "ttag";

import { Box, Space, Text } from "metabase/ui";

import { ChartTypeList, type ChartTypeListProps } from "../ChartTypeList";

export type ChartTypeSettingsProps = {
  sensibleVisualizations: ChartTypeListProps["visualizationList"];
  nonSensibleVisualizations: ChartTypeListProps["visualizationList"];
} & Pick<
  ChartTypeListProps,
  "selectedVisualization" | "onSelectVisualization" | "onOpenSettings"
>;

export const ChartTypeSettings = ({
  selectedVisualization,
  onSelectVisualization,
  sensibleVisualizations,
  nonSensibleVisualizations,
  onOpenSettings,
}: ChartTypeSettingsProps) => (
  <Box display="contents" data-testid="chart-type-settings">
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
      onOpenSettings={onOpenSettings}
    />
  </Box>
);
