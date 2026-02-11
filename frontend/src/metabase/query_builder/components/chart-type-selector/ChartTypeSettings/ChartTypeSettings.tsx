import { t } from "ttag";

import { CollapseSection } from "metabase/common/components/CollapseSection";
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
}: ChartTypeSettingsProps) => {
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

      <CollapseSection
        header={
          <Text
            fw="bold"
            c="text-secondary"
            tt="uppercase"
            fz="sm"
            data-testid="more-charts-toggle"
          >{t`More charts`}</Text>
        }
        initialState={
          nonSensibleVisualizations.includes(selectedVisualization)
            ? "expanded"
            : "collapsed"
        }
        iconPosition="right"
        iconSize={10}
      >
        <>
          <Space h="sm" />
          <ChartTypeList
            data-testid="display-options-not-sensible"
            visualizationList={nonSensibleVisualizations}
            onSelectVisualization={onSelectVisualization}
            selectedVisualization={selectedVisualization}
            onOpenSettings={onOpenSettings}
          />
        </>
      </CollapseSection>
    </Stack>
  );
};
