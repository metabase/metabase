import { t } from "ttag";

import { Space, Text } from "metabase/ui";

import { ChartTypeList, type ChartTypeListProps } from "../ChartTypeList";

export type ChartTypeSettingsProps = {
  sensibleVisualizations: ChartTypeListProps["visualizationList"];
  nonSensibleVisualizations: ChartTypeListProps["visualizationList"];
} & Pick<ChartTypeListProps, "selectedVisualization" | "onSelectVisualization">;

export const ChartTypeSettings = ({
  selectedVisualization,
  onSelectVisualization,
  sensibleVisualizations,
  nonSensibleVisualizations,
}: ChartTypeSettingsProps) => {
  console.log("ChartTypeSEttings", {
    selectedVisualization,
    onSelectVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  });
  return (
    <>
      <ChartTypeList
        data-testid="display-options-sensible"
        visualizationList={sensibleVisualizations}
        onSelectVisualization={display => {
          console.log("charttypesettings sensible", display);
          onSelectVisualization(display);
        }}
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
        onSelectVisualization={display => {
          console.log("charttypesettings", display);
          onSelectVisualization(display);
        }}
        selectedVisualization={selectedVisualization}
      />
    </>
  );
};
