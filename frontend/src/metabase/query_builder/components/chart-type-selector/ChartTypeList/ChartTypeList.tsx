import { Grid } from "metabase/ui";
import type { CardDisplayType } from "metabase-types/api";

import { ChartTypeOption, type ChartTypeOptionProps } from "../ChartTypeOption";

export type ChartTypeListProps = {
  visualizationList: CardDisplayType[];
  "data-testid"?: string;
} & Pick<
  ChartTypeOptionProps,
  "selectedVisualization" | "onSelectVisualization" | "onOpenSettings"
>;

export const ChartTypeList = ({
  visualizationList,
  onSelectVisualization,
  selectedVisualization,
  onOpenSettings,
  "data-testid": dataTestId,
}: ChartTypeListProps) => (
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
          onSelectVisualization={onSelectVisualization}
          onOpenSettings={onOpenSettings}
        />
      </Grid.Col>
    ))}
  </Grid>
);
