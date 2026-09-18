import { Grid } from "metabase/ui";
import type { VisualizationDisplay } from "metabase-types/api";

import { ChartTypeOption, type ChartTypeOptionProps } from "../ChartTypeOption";

export type ChartTypeListProps = {
  visualizationList: VisualizationDisplay[];
  "data-testid"?: string;
  isVisualizationDisabled?: (display: VisualizationDisplay) => boolean;
  disabledReason?: string;
} & Pick<
  ChartTypeOptionProps,
  "selectedVisualization" | "onSelectVisualization" | "onOpenSettings"
>;

export const ChartTypeList = ({
  visualizationList,
  onSelectVisualization,
  selectedVisualization,
  onOpenSettings,
  isVisualizationDisabled,
  disabledReason,
  "data-testid": dataTestId,
}: ChartTypeListProps) => (
  <Grid
    data-testid={dataTestId}
    align="flex-start"
    justify="flex-start"
    grow={false}
  >
    {visualizationList.map((type) => (
      <Grid.Col span={3} key={type} data-testid="chart-type-list-col">
        <ChartTypeOption
          key={type}
          visualizationType={type}
          selectedVisualization={selectedVisualization}
          onSelectVisualization={onSelectVisualization}
          onOpenSettings={onOpenSettings}
          isDisabled={isVisualizationDisabled?.(type)}
          disabledReason={disabledReason}
        />
      </Grid.Col>
    ))}
  </Grid>
);
