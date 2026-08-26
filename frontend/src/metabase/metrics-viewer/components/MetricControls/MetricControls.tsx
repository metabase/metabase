import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import { Box } from "metabase/ui";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";

import { CenterControls } from "./CenterControls";
import { LeftControls } from "./LeftControls";
import S from "./MetricControls.module.css";

type MetricControlsProps = {
  definition: MetricDefinition;
  allFilterDimensions?: DimensionMetadata[];
  showStackSeries?: boolean;
  canToggleColumnLabels?: boolean;
};

export function MetricControls({
  definition,
  allFilterDimensions,
  showStackSeries,
  canToggleColumnLabels,
}: MetricControlsProps) {
  const { activeDimensionBreakout } = useMetricsViewerContext();

  if (!activeDimensionBreakout) {
    return null;
  }

  return (
    <Box className={S.root} data-testid="metrics-viewer-controls">
      <LeftControls showStackSeries={showStackSeries} />
      <CenterControls
        definition={definition}
        allFilterDimensions={allFilterDimensions}
        canToggleColumnLabels={canToggleColumnLabels}
      />
    </Box>
  );
}
