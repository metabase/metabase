import { t } from "ttag";

import { Code, Group, Stack, Text } from "metabase/ui";

import { formatDataCheckValue } from "../../utils";

import { FailingRowsView } from "./FailingRowsView";
import type { DataCheckViewProps } from "./types";

export function GenericResultView(props: DataCheckViewProps) {
  const { metric, threshold } = props.result;

  return (
    <Stack gap="md" data-testid="data-check-generic-view">
      {(metric != null || threshold != null) && (
        <Group gap="xl">
          {metric != null && (
            <Stack gap="xs">
              <Text c="text-secondary" fz="sm">{t`Measured`}</Text>
              <Code>{formatDataCheckValue(metric)}</Code>
            </Stack>
          )}
          {threshold != null && (
            <Stack gap="xs">
              <Text c="text-secondary" fz="sm">{t`Expected`}</Text>
              <Code>{formatDataCheckValue(threshold)}</Code>
            </Stack>
          )}
        </Group>
      )}
      <FailingRowsView {...props} />
    </Stack>
  );
}
