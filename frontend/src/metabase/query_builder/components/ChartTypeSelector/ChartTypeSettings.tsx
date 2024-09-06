import { t } from "ttag";

import type { CardDisplayType } from "metabase-types/api";

import { ChartTypeOption, type ChartTypeOptionProps } from "./ChartTypeOption";
import { OptionLabel, OptionList } from "./ChartTypeSidebar.styled";

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

type ChartTypeListProps = {
  visualizationList: CardDisplayType[];
  "data-testid"?: string;
} & Pick<
  ChartTypeOptionProps,
  "selectedVisualization" | "onSelectVisualization"
>;

const ChartTypeList = ({
  visualizationList,
  onSelectVisualization,
  selectedVisualization,
  "data-testid": dataTestId,
}: ChartTypeListProps) => (
  <OptionList data-testid={dataTestId}>
    {visualizationList.map(type => (
      <ChartTypeOption
        key={type}
        visualizationType={type}
        selectedVisualization={selectedVisualization}
        onSelectVisualization={onSelectVisualization}
      />
    ))}
  </OptionList>
);
