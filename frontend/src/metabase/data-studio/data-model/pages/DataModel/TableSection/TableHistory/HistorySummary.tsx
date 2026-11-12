import type { ReactNode } from "react";
import { t } from "ttag";

import {
  getHistoryShape,
  getHistoryShapeOptions,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { Stack, Text } from "metabase/ui";
import type { FieldId, Table } from "metabase-types/api";

import { HistoryVersionsSummary } from "./HistoryBindingRows";
import { FactKeyList } from "./HistoryShapeInputs";
import { useScdDetails } from "./use-scd-details";

type SummaryRow = { label: string; value: ReactNode };

/**
 * How a history table keeps its versions, read-only: the same settings
 * Connected data's History tab edits, in the same words.
 */
export function HistorySummary({ table }: { table: Table }) {
  const { history: binding } = useTableStructures().getTableStructure(table);
  const scd = useScdDetails(table);
  const fields = table.fields ?? [];
  const shape = getHistoryShape(
    scd.resolution.scdType,
    binding.validToFieldId != null,
  );
  const getFieldName = (fieldId: FieldId | null) =>
    fields.find((field) => field.id === fieldId)?.display_name ?? t`Not set`;

  const rows: SummaryRow[] = [
    {
      label: t`History`,
      value: getHistoryShapeOptions().find(({ value }) => value === shape)
        ?.label,
    },
    ...(shape === "current-table"
      ? [
          {
            label: t`Current table`,
            value: scd.currentTable?.display_name ?? t`Not set`,
          },
        ]
      : []),
    ...(shape === "current-values"
      ? [
          {
            label: t`Current values`,
            value:
              scd.currentValueFields
                .map((field) => field.display_name)
                .join(", ") || t`Not set`,
          },
        ]
      : []),
    ...(shape === "fact-key"
      ? [
          {
            label: t`Facts join on`,
            value: <FactKeyList factKeyFields={scd.factKeyFields} />,
          },
        ]
      : []),
    { label: t`Entity key`, value: getFieldName(binding.durableKeyFieldId) },
    { label: t`Valid from`, value: getFieldName(binding.validFromFieldId) },
    {
      label: t`Valid to`,
      value:
        binding.validToFieldId != null
          ? getFieldName(binding.validToFieldId)
          : t`No valid to`,
    },
    ...(binding.currentFlagFieldId != null
      ? [
          {
            label: t`Current flag`,
            value: getFieldName(binding.currentFlagFieldId),
          },
        ]
      : []),
    ...(binding.versionFieldId != null
      ? [{ label: t`Version`, value: getFieldName(binding.versionFieldId) }]
      : []),
    { label: t`Versions`, value: <HistoryVersionsSummary table={table} /> },
  ];

  return (
    <Stack gap="xl">
      {rows.map(({ label, value }) => (
        <Stack key={label} gap="xxs">
          <Text size="sm" fw="bold" c="text-secondary">
            {label}
          </Text>
          {typeof value === "string" ? <Text>{value}</Text> : value}
        </Stack>
      ))}
    </Stack>
  );
}
