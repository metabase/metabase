import { useState } from "react";
import { noop } from "underscore";

import { Warnings } from "metabase/common/components/Warnings";
import { Alert, Box, Flex, Icon, Stack, Title } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { VisualizationRunningState } from "metabase/visualizations/components/Visualization/VisualizationRunningState";
import { getChartSkeletonImage } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeleton";
import type { ClickActionsMode } from "metabase/visualizations/types";
import type { CardDisplayType, RawSeries } from "metabase-types/api";

import S from "./AnalysisResult.module.css";

type AnalysisResultProps = {
  /** Undefined when the analysis can't be built. */
  title: string | undefined;
  display: CardDisplayType | undefined;
  rawSeries: RawSeries | null;
  isRunning: boolean;
  error: string | undefined;
  /** The chart's click actions. None when undefined. */
  mode?: ClickActionsMode;
};

export const AnalysisResult = ({
  title,
  display,
  rawSeries,
  isRunning,
  error,
  mode,
}: AnalysisResultProps) => {
  const [warnings, setWarnings] = useState<string[]>([]);
  // A rerun has no result until it finishes, so the last run's chart stays up
  // under a running overlay. When the last run failed, or there was none, a
  // skeleton shows instead.
  const [lastRawSeries, setLastRawSeries] = useState(rawSeries);
  if (!isRunning && rawSeries !== lastRawSeries) {
    setLastRawSeries(rawSeries);
  }
  const shownRawSeries = isRunning ? lastRawSeries : rawSeries;

  return (
    <Stack flex={1} mih={0}>
      {title !== undefined && <Title order={4}>{title}</Title>}
      {error !== undefined && (
        <Alert color="error" icon={<Icon name="warning" />}>
          {error}
        </Alert>
      )}
      {isRunning && shownRawSeries === null && (
        <Flex
          direction="column"
          flex={1}
          mih={0}
          data-testid="analysis-result-skeleton"
        >
          {getChartSkeletonImage(display)}
        </Flex>
      )}
      {shownRawSeries !== null && (
        <Box flex={1} mih={0} pos="relative">
          <Warnings warnings={warnings} className={S.warnings} size={18} />
          <Visualization
            rawSeries={shownRawSeries}
            isQueryBuilder={false}
            mode={mode}
            onChangeCardAndRun={noop}
            onUpdateWarnings={setWarnings}
          />
          {isRunning && <VisualizationRunningState className={S.overlay} />}
        </Box>
      )}
    </Stack>
  );
};
