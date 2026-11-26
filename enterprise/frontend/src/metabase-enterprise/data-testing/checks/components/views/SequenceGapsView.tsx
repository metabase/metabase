import { t } from "ttag";

import { Box, Group, Icon, Stack, Text } from "metabase/ui";

import type { DataCheckDefinition, DataCheckRow } from "../../types";
import { formatDataCheckValue } from "../../utils";

import { FailingRowsView } from "./FailingRowsView";
import type { DataCheckViewProps } from "./types";

export function SequenceGapsView(props: DataCheckViewProps) {
  const { definition, result } = props;
  const rows = result["failing-rows"] ?? [];
  const missingValues = getMissingValues(rows);

  if (missingValues != null) {
    const total = typeof result.metric === "number" ? result.metric : null;
    return (
      <Stack gap="sm">
        <Text c="text-secondary">
          {total != null && total > missingValues.length
            ? t`Showing ${missingValues.length} of ${total} missing values`
            : t`Missing values`}
        </Text>
        <Group gap="sm">
          {missingValues.map((value) => (
            <Box
              key={value}
              px="sm"
              py={2}
              bdrs="sm"
              ff="monospace"
              fz="sm"
              bd="1px dashed var(--mb-color-feedback-negative)"
            >
              {value}
            </Box>
          ))}
        </Group>
      </Stack>
    );
  }

  const breaks = rows.flatMap((row) => getSequenceBreak(definition, row) ?? []);

  return (
    <Stack gap="md">
      {breaks.length > 0 && (
        <Stack gap="xs">
          {breaks.map(({ before, after, label }, index) => (
            <Group key={index} gap="sm">
              <Box ff="monospace" fz="sm">
                {before}
              </Box>
              <Icon name="arrow_right" c="feedback-negative" />
              <Box ff="monospace" fz="sm" fw="bold">
                {after}
              </Box>
              <Text c="text-secondary" fz="sm">
                {label}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
      <FailingRowsView {...props} />
    </Stack>
  );
}

function getMissingValues(rows: readonly DataCheckRow[]): string[] | null {
  if (rows.length === 0) {
    return null;
  }
  const values = rows.map((row) => {
    const entries = Object.entries(row);
    const [entry] = entries;
    return entries.length === 1 && entry[0].startsWith("missing_")
      ? formatDataCheckValue(entry[1])
      : null;
  });
  return values.every((value) => value != null) ? values : null;
}

type SequenceBreak = {
  before: string;
  after: string;
  label: string;
};

function getSequenceBreak(
  definition: DataCheckDefinition,
  row: DataCheckRow,
): SequenceBreak | null {
  const { column, upper } = definition.params;
  if ("previous_value" in row && typeof column === "string") {
    return {
      before: formatDataCheckValue(row.previous_value),
      after: formatDataCheckValue(row[column]),
      label: t`previous value, then this row`,
    };
  }
  if ("next_lower" in row && typeof upper === "string") {
    return {
      before:
        row[upper] == null ? t`open end` : formatDataCheckValue(row[upper]),
      after: formatDataCheckValue(row.next_lower),
      label: t`end of this range, then start of the next`,
    };
  }
  return null;
}
