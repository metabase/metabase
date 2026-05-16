import { c } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  FixedSizeIcon,
  Flex,
  type FlexProps,
  Loader,
  Tooltip,
} from "metabase/ui";
import type { Dataset } from "metabase-types/api";

import {
  getAbbreviatedRelativeTimeStrings,
  getStaleCacheTooltipLabel,
  getTimePassedSince,
} from "./utils";

export type QuestionLastUpdatedProps = {
  result: Pick<Dataset, "cached" | "stale">;
} & FlexProps;

export const QuestionLastUpdated = ({
  result,
  ...flexProps
}: QuestionLastUpdatedProps) => {
  if (!result) {
    return null;
  }
  // Since dayjs might fail to interpret the timestamp, the getTimePassedSince
  // utility function can throw an Error. Hence the ErrorBoundary here
  return (
    <ErrorBoundary>
      <QuestionLastUpdatedBody
        timestamp={result.cached}
        stale={result.stale}
        {...flexProps}
      />
    </ErrorBoundary>
  );
};

const QuestionLastUpdatedBody = ({
  timestamp,
  stale,
  ...flexProps
}: { timestamp?: string | null; stale?: boolean } & FlexProps) => {
  const shortExplanation = stale
    ? null
    : getTimePassedSince({
        timestamp,
        relativeTimeStrings: getAbbreviatedRelativeTimeStrings(),
      });
  const longExplanation = stale
    ? getStaleCacheTooltipLabel(timestamp)
    : c("{0} is a phrase like '1 minute ago' or '30 seconds ago'")
        .t`Showing cached results from ${getTimePassedSince({ timestamp, withoutSuffix: false })}`;
  return (
    <Tooltip label={longExplanation}>
      <Flex
        gap="xs"
        align="center"
        fw="bold"
        aria-label={longExplanation}
        {...flexProps}
      >
        {stale ? (
          <Loader size="xs" />
        ) : (
          <>
            <FixedSizeIcon name="time_history" />
            {shortExplanation}
          </>
        )}
      </Flex>
    </Tooltip>
  );
};

QuestionLastUpdated.shouldRender = ({ result }: QuestionLastUpdatedProps) =>
  result && result.cached;
