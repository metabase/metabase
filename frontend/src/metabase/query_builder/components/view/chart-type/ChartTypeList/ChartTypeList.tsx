import { Grid } from "metabase/ui";
import type { CardDisplayType } from "metabase-types/api";

import { ChartTypeOption } from "../ChartTypeOption";

export type ChartTypeListProps = {
  visualizationList: CardDisplayType[];
  selectedVisualization: CardDisplayType;
  onClick: (vizType: CardDisplayType) => void;
};

export const ChartTypeList = ({
  visualizationList,
  selectedVisualization,
  onClick,
}: ChartTypeListProps) => {
  return (
    <Grid align="flex-start" justify="flex-start" grow={false}>
      {visualizationList.map(type => (
        <Grid.Col span={3} key={type} data-testid="chart-type-list-col">
          <ChartTypeOption
            visualizationType={type}
            selectedVisualization={selectedVisualization}
            onClick={onClick}
          />
        </Grid.Col>
      ))}
    </Grid>
  );
};
