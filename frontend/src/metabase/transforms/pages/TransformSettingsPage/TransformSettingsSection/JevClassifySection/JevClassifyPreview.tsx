import { t } from "ttag";
import _ from "underscore";

import type { JevClassifyPreview as Preview } from "metabase/api";
import { Table } from "metabase/common/components/Table";
import { Badge, Box, Group, ScrollArea, Stack, Text } from "metabase/ui";
import type { RowValue } from "metabase-types/api";

import {
  CONFIDENCE_COLUMN_SUFFIX,
  type StepDraft,
  getOutputColumnNames,
} from "./utils";

const UNSURE_ANSWER = "unsure";

type PreviewRow = { id: number; values: Map<string, RowValue> };

type JevClassifyPreviewProps = {
  preview: Preview;
  steps: readonly StepDraft[];
};

export function JevClassifyPreview({
  preview,
  steps,
}: JevClassifyPreviewProps) {
  const columnNames = getPreviewColumnNames(steps);
  const rows: PreviewRow[] = preview.rows.map((row, index) => ({
    id: index,
    values: new Map(
      preview.columns.map((column, columnIndex) => [
        column.name,
        row[columnIndex] ?? null,
      ]),
    ),
  }));
  const { rows: rowCount, "elapsed-ms": elapsedMs } = preview.stats;
  const failureCount = preview.stats["jev-failures"];

  return (
    <Stack gap="sm">
      <Group gap="sm">
        <Text c="text-secondary" size="sm">
          {t`Jev judged ${rowCount} rows in ${elapsedMs} ms.`}
        </Text>
        {failureCount > 0 && (
          <Text c="error" size="sm">
            {t`${failureCount} Jev calls failed.`}
          </Text>
        )}
      </Group>
      <ScrollArea.Autosize mah="28rem">
        <Table
          columns={columnNames.map((name) => ({ key: name, name }))}
          rows={rows}
          rowRenderer={(row) => (
            <tr key={row.id}>
              {columnNames.map((name) => (
                <td key={name}>
                  <PreviewCell
                    value={row.values.get(name) ?? null}
                    confidence={row.values.get(
                      `${name}${CONFIDENCE_COLUMN_SUFFIX}`,
                    )}
                  />
                </td>
              ))}
            </tr>
          )}
        />
      </ScrollArea.Autosize>
    </Stack>
  );
}

/** Each step's input columns, then the columns it writes, without repeats. */
function getPreviewColumnNames(steps: readonly StepDraft[]): string[] {
  const names = steps.flatMap((step) => [
    ...step.inputs,
    ...(step.mode === "new-column"
      ? getOutputColumnNames(step).filter(
          (name) => !name.endsWith(CONFIDENCE_COLUMN_SUFFIX),
        )
      : [step.column]),
  ]);
  return _.uniq(names.filter((name) => name !== ""));
}

type PreviewCellProps = {
  value: RowValue;
  confidence: RowValue | undefined;
};

function PreviewCell({ value, confidence }: PreviewCellProps) {
  if (typeof confidence === "number") {
    const isUnsure = value === UNSURE_ANSWER;
    return (
      <Badge
        color={isUnsure ? "neutral" : "brand"}
        variant="light"
        title={t`Jev is ${Math.round(confidence * 100)}% confident`}
      >
        {`${String(value)} · ${Math.round(confidence * 100)}%`}
      </Badge>
    );
  }
  if (typeof value === "number") {
    return <Text>{Number.isInteger(value) ? value : value.toFixed(2)}</Text>;
  }
  return (
    <Box maw="32rem">
      <Text lineClamp={3}>{value == null ? "" : String(value)}</Text>
    </Box>
  );
}
