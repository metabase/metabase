import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { Flex } from "metabase/ui";

/** Centered placeholder shown (in place of the tabs/charts) when the filtered view has no tool calls. */
export function McpAnalyticsEmptyState() {
  return (
    <Flex flex={1} mih="60vh" align="center" justify="center">
      <EmptyState
        icon="audit"
        title={t`No MCP activity`}
        message={t`Tool calls from MCP clients will show up here. Try widening the date range or check back once clients start using the server.`}
      />
    </Flex>
  );
}
