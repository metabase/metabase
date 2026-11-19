import { useState } from "react";
import { noop } from "underscore";

import { Warnings } from "metabase/common/components/Warnings";
import { Alert, Box, Flex, Icon, Stack, Title } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { getChartSkeletonImage } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeleton";
import type { CardDisplayType, RawSeries } from "metabase-types/api";

import S from "./AnalysisResult.module.css";

type AnalysisResultProps = {
  /** Undefined when the analysis can't be built. */
  title: string | undefined;
  display: CardDisplayType | undefined;
  rawSeries: RawSeries | null;
  isRunning: boolean;
  error: string | undefined;
};

export const AnalysisResult = ({
  title,
  display,
  rawSeries,
  isRunning,
  error,
}: AnalysisResultProps) => {
  const [warnings, setWarnings] = useState<string[]>([]);

  return (
    <Stack flex={1} mih={0}>
      {title !== undefined && <Title order={4}>{title}</Title>}
      {error !== undefined && (
        <Alert color="error" icon={<Icon name="warning" />}>
          {error}
        </Alert>
      )}
      {isRunning && (
        <Flex
          direction="column"
          flex={1}
          mih={0}
          data-testid="analysis-result-skeleton"
        >
          {getChartSkeletonImage(display)}
        </Flex>
      )}
      {!isRunning && rawSeries !== null && (
        <Box flex={1} mih={0} pos="relative">
          <Warnings warnings={warnings} className={S.warnings} size={18} />
          <Visualization
            rawSeries={rawSeries}
            isQueryBuilder={false}
            onChangeCardAndRun={noop}
            onUpdateWarnings={setWarnings}
          />
        </Box>
      )}
    </Stack>
  );
};
