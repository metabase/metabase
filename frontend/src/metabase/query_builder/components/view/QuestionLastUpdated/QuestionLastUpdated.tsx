import { c } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Flex, FixedSizeIcon, Tooltip, type FlexProps } from "metabase/ui";

import { getTimePassedSince, getAbbreviatedRelativeTimeStrings } from "./utils";

export const QuestionLastUpdated = ({
  result,
  ...flexProps
}: {
  result: { cached?: string | null };
} & FlexProps) => {
  if (!result) {
    return null;
  }
  // Since dayjs might fail to interpret the timestamp, the getTimePassedSince
  // utility function can throw an Error. Hence the ErrorBoundary here
  return (
    <ErrorBoundary>
      <QuestionLastUpdatedBody timestamp={result.cached} {...flexProps} />
    </ErrorBoundary>
  );
};

const QuestionLastUpdatedBody = ({
  timestamp,
  ...flexProps
}: { timestamp?: string | null } & FlexProps) => {
  const shortExplanation = getTimePassedSince({
    timestamp,
    relativeTimeStrings: getAbbreviatedRelativeTimeStrings(),
  });
  const longExplanation = c(
    "{0} is a phrase like '1 minute ago' or '30 seconds ago'",
  ).t`Showing cached results from ${getTimePassedSince({
    timestamp,
    withoutSuffix: false,
  })}`;
  return (
    <Tooltip label={longExplanation}>
      <Flex
        gap="xs"
        align="center"
        fw="bold"
        aria-label={longExplanation}
        {...flexProps}
      >
        <FixedSizeIcon name="calendar" />
        {shortExplanation}
      </Flex>
    </Tooltip>
  );
};

QuestionLastUpdated.shouldRender = ({ result }: { result: any }) =>
  result && result.cached;
