import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { Flex } from "metabase/ui";

/** Centered placeholder shown (in place of the tabs/charts) when the filtered view has no calls. */
export function ApiKeyUsageEmptyState() {
  return (
    <Flex flex={1} mih="60vh" align="center" justify="center">
      <EmptyState
        icon="key"
        title={t`No API key activity`}
        message={t`Requests authenticated with an API key will show up here. Try widening the date range or check back once a key is used.`}
      />
    </Flex>
  );
}
