import { jt, t } from "ttag";

import { LoadingSkeleton } from "metabase/common/components/Skeletons";
import CS from "metabase/css/core/index.css";
import { Box, Center } from "metabase/ui";
import { duration } from "metabase/utils/formatting";
import { getChartSkeletonImage } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeleton";
import ScalarSkeleton from "metabase/visualizations/components/skeletons/ScalarSkeleton/ScalarSkeleton";
import type { CardSlownessStatus } from "metabase/visualizations/types";
import type { CardDisplayType } from "metabase-types/api";

export interface LoadingViewProps {
  isSlow: CardSlownessStatus | undefined;
  expectedDuration?: number;
  /** The chart type the skeleton is drawn as; a table when unknown. */
  display?: CardDisplayType;
}

function SlowQueryView({ expectedDuration, isSlow }: LoadingViewProps) {
  return (
    <Box c="text-secondary">
      <Box component="span" fw="bold" fz="1.12em">
        {t`Still Waiting…`}
      </Box>
      {isSlow === "usually-slow" ? (
        <div>
          {jt`This usually takes an average of ${(
            <span key="duration" className={CS.textNoWrap}>
              {duration(expectedDuration ?? 0)}
            </span>
          )}, but is currently taking longer.`}
        </div>
      ) : (
        <div>
          {t`This usually loads immediately, but is currently taking longer.`}
        </div>
      )}
    </Box>
  );
}

function LoadingView({ expectedDuration, isSlow, display }: LoadingViewProps) {
  const isScalar = display === "scalar" || display === "smartscalar";

  return (
    <LoadingSkeleton flex="1 0 auto" pos="relative" gap={0} p="sm">
      {isScalar ? (
        <ScalarSkeleton />
      ) : (
        getChartSkeletonImage(display ?? "table")
      )}
      {isSlow && (
        <Center pos="absolute" inset={0} ta="center" px="sm">
          <SlowQueryView expectedDuration={expectedDuration} isSlow={isSlow} />
        </Center>
      )}
    </LoadingSkeleton>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LoadingView;
