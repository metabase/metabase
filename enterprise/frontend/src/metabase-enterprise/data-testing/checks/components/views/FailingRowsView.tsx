import { t } from "ttag";

import { Stack, Text } from "metabase/ui";

import { getDataCheckHighlightedColumns } from "../../utils";
import { DataCheckRowsTable } from "../DataCheckRowsTable";

import type { DataCheckViewProps } from "./types";

type FailingRowsViewProps = DataCheckViewProps & {
  columnLabels?: Readonly<Record<string, string>>;
  extraHighlightedColumns?: readonly string[];
};

export function FailingRowsView({
  definition,
  result,
  entry,
  columnLabels,
  extraHighlightedColumns = [],
}: FailingRowsViewProps) {
  const rows = result["failing-rows"] ?? [];
  if (rows.length === 0) {
    return null;
  }
  const total = typeof result.metric === "number" ? result.metric : null;
  const shown = rows.length;

  return (
    <Stack gap="sm">
      {total != null && total > shown && (
        <Text c="text-secondary">{t`Showing ${shown} of ${total} rows`}</Text>
      )}
      <DataCheckRowsTable
        rows={rows}
        ariaLabel={t`Failing rows of ${result.display}`}
        highlightedColumns={[
          ...getDataCheckHighlightedColumns(definition, entry),
          ...extraHighlightedColumns,
        ]}
        columnLabels={columnLabels}
      />
    </Stack>
  );
}
