import { t } from "ttag";

import { ChartTypeList, type ChartTypeListProps } from "../ChartTypeList";

import { OptionLabel } from "./ChartTypeSettings.styled";

type ChartTypeSettingsProps = {
  sensibleVisualizations: ChartTypeListProps["visualizationList"];
  nonSensibleVisualizations: ChartTypeListProps["visualizationList"];
} & Pick<ChartTypeListProps, "selectedVisualization" | "onSelectVisualization">;

export const ChartTypeSettings = ({
  selectedVisualization,
  onSelectVisualization,
  sensibleVisualizations,
  nonSensibleVisualizations,
}: ChartTypeSettingsProps) => (
  <>
    <ChartTypeList
      data-testid="display-options-sensible"
      visualizationList={sensibleVisualizations}
      onSelectVisualization={onSelectVisualization}
      selectedVisualization={selectedVisualization}
    />
    <OptionLabel>{t`Other charts`}</OptionLabel>

    <ChartTypeList
      data-testid="display-options-not-sensible"
      visualizationList={nonSensibleVisualizations}
      onSelectVisualization={onSelectVisualization}
      selectedVisualization={selectedVisualization}
    />
  </>
);
