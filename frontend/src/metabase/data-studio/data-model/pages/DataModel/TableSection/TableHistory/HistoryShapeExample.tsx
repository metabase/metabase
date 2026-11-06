import cx from "classnames";
import { t } from "ttag";

import {
  useHistoryReviewStatus,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Stack, Text } from "metabase/ui";
import type { FieldId, Table } from "metabase-types/api";

import S from "./HistoryShapeExample.module.css";
import {
  type ExampleSource,
  type ShapeExample,
  getMockExampleVersions,
  getProfileExampleVersions,
} from "./history-shape-example";
import type { ScdDetails } from "./use-scd-details";

export function HistoryShapeExample({
  description,
  example,
}: {
  description: string;
  example: ShapeExample;
}) {
  return (
    <Stack gap="sm" py={4}>
      <Text c="inherit" size="sm" className={S.text}>
        {description}
      </Text>
      <Box component="table" className={S.table}>
        <thead>
          <tr>
            {example.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {example.rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={cx({
                [S.currentRow]: rowIndex === example.currentRowIndex,
              })}
            >
              {row.map((value, columnIndex) => (
                <td key={columnIndex}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
      {example.note != null && (
        <Text c="inherit" size="sm" className={S.text}>
          {example.note}
        </Text>
      )}
    </Stack>
  );
}

export function useHistoryExampleSource(
  table: Table,
  scd: Pick<ScdDetails, "currentTable" | "factKeyFields">,
): ExampleSource {
  const status = useHistoryReviewStatus(table);
  const { history } = useTableStructures().getTableStructure(table);
  const fields = table.fields ?? [];
  const nameOf = (fieldId: FieldId | null) =>
    fields.find((field) => getRawTableFieldId(field) === fieldId)?.display_name;
  const profile =
    status?.profileState.status === "loaded"
      ? status.profileState.profile
      : null;
  const fromProfile = profile ? getProfileExampleVersions(profile) : null;

  return {
    keyName: nameOf(history.durableKeyFieldId) ?? t`ID`,
    attributeName: fromProfile?.attributeName ?? t`Plan`,
    validFromName: nameOf(history.validFromFieldId) ?? t`Valid from`,
    validToName: nameOf(history.validToFieldId) ?? t`Valid to`,
    versions: fromProfile?.versions ?? getMockExampleVersions(),
    currentTableName: scd.currentTable?.display_name ?? null,
    factTableName: scd.factKeyFields[0]?.table.display_name ?? null,
  };
}
