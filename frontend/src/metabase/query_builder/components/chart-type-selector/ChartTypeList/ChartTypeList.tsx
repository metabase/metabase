import { ChartTypeOption, type ChartTypeOptionProps } from "../ChartTypeOption";

import { OptionList } from "./ChartTypeList.styled";

export type ChartTypeListProps = {
  visualizationList: ChartTypeOptionProps["visualizationType"][];
  "data-testid"?: string;
} & Pick<
  ChartTypeOptionProps,
  "selectedVisualization" | "onSelectVisualization"
>;

export const ChartTypeList = ({
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
