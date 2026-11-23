import { Stack, Text } from "metabase/ui";

import { FailingRowsView } from "./FailingRowsView";
import type { DataCheckViewProps } from "./types";

export function ResultMessage(props: DataCheckViewProps) {
  return (
    <Stack gap="md" data-testid="data-check-message-view">
      {props.result.message != null && <Text>{props.result.message}</Text>}
      <FailingRowsView {...props} />
    </Stack>
  );
}
