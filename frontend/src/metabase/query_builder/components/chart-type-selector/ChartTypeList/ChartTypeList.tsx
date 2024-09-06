import { Grid } from "metabase/ui";

import { ChartTypeOption, type ChartTypeOptionProps } from "../ChartTypeOption";

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
}: ChartTypeListProps) => {
  console.log("ChartTypeList", {
    visualizationList,
    onSelectVisualization,
    selectedVisualization,
    "data-testid": dataTestId,
  });
  return (
    <Grid
      data-testid={dataTestId}
      align="flex-start"
      justify="flex-start"
      grow={false}
    >
      {visualizationList.map(type => (
        <Grid.Col span={3} key={type} data-testid="chart-type-list-col">
          <ChartTypeOption
            key={type}
            visualizationType={type}
            selectedVisualization={selectedVisualization}
            onSelectVisualization={display => {
              console.log("charttypelist", display);
              onSelectVisualization(display);
            }}
          />
        </Grid.Col>
      ))}
    </Grid>
  );
};
