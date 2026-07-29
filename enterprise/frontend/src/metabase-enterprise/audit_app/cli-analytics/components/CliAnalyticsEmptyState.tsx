import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { Flex } from "metabase/ui";

/** Centered placeholder shown (in place of the tabs/charts) when the filtered view has no calls. */
export function CliAnalyticsEmptyState() {
  return (
    <Flex flex={1} mih="60vh" align="center" justify="center">
      <EmptyState
        icon="audit"
        title={t`No CLI activity`}
        message={t`Calls from the CLI and other Agent API clients will show up here. Try widening the date range or check back once clients start making requests.`}
      />
    </Flex>
  );
}
