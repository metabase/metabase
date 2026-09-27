import { Grid } from "metabase/ui";
import type { VisualizationDisplay } from "metabase-types/api";

import { ChartTypeOption, type ChartTypeOptionProps } from "../ChartTypeOption";

export type ChartTypeListProps = {
  visualizationList: VisualizationDisplay[];
  "data-testid"?: string;
  /** Jev fit scores (0..1) keyed by display type; absent when no suggestion yet. */
  recommendationScores?: Partial<Record<VisualizationDisplay, number>>;
  /** The set of display types Jev highlights (top-ranked). */
  recommendedTypes?: Set<VisualizationDisplay>;
} & Pick<
  ChartTypeOptionProps,
  "selectedVisualization" | "onSelectVisualization" | "onOpenSettings"
>;

export const ChartTypeList = ({
  visualizationList,
  onSelectVisualization,
  selectedVisualization,
  onOpenSettings,
  recommendationScores,
  recommendedTypes,
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
          recommendationScore={recommendationScores?.[type]}
          isRecommended={recommendedTypes?.has(type)}
        />
      </Grid.Col>
    ))}
  </Grid>
);
