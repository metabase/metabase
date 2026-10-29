import { jt, t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Box, Loader } from "metabase/ui";
import { duration } from "metabase/utils/formatting";
import type { CardSlownessStatus } from "metabase/visualizations/types";

import { StateView } from "../StateView";

export interface LoadingViewProps {
  isSlow: CardSlownessStatus | undefined;
  expectedDuration?: number;
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

function LoadingView({ expectedDuration, isSlow }: LoadingViewProps) {
  return (
    <StateView pt="sm" c="core-brand">
      {isSlow ? (
        <SlowQueryView expectedDuration={expectedDuration} isSlow={isSlow} />
      ) : (
        <Loader size="lg" color="text-secondary" />
      )}
    </StateView>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LoadingView;
