import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  type HistoryBinding,
  findFieldById,
  inferBindingForHistoryTable,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { ActionIcon, Icon, Popover, Select, Stack, Tooltip } from "metabase/ui";
import type { FieldId, Table } from "metabase-types/api";

type BindingKey = keyof Pick<
  HistoryBinding,
  "durableKeyFieldId" | "validFromFieldId" | "validToFieldId"
>;

type HistoryKeyAndDatesProps = {
  dimensionTable: Table;
  historyTable: Table;
  readOnly: boolean;
};

/**
 * PROTOTYPE: mocked. A settings icon for how a history table's rows line up
 * with its dimension. Metabase guesses it, so it stays out of sight.
 */
export function HistoryKeyAndDates({
  dimensionTable,
  historyTable,
  readOnly,
}: HistoryKeyAndDatesProps) {
  const [isOpened, { toggle, close }] = useDisclosure(false);
  const { getTableStructure, setHistoryBinding } = useTableStructures();
  const inferred = inferBindingForHistoryTable(dimensionTable, historyTable);
  const binding = getTableStructure(historyTable).history;
  const values: Record<BindingKey, FieldId | null> = {
    durableKeyFieldId: binding.durableKeyFieldId ?? inferred.keyFieldId,
    validFromFieldId: binding.validFromFieldId ?? inferred.validFromFieldId,
    validToFieldId: binding.validToFieldId ?? inferred.validToFieldId,
  };
  const data = (historyTable.fields ?? []).map((field) => ({
    value: String(getRawTableFieldId(field)),
    label: field.display_name,
  }));
  const rows: { key: BindingKey; label: string }[] = [
    { key: "durableKeyFieldId", label: t`Matched on` },
    { key: "validFromFieldId", label: t`True from` },
    { key: "validToFieldId", label: t`True until` },
  ];
  const settingsLabel = t`${historyTable.display_name} settings`;

  return (
    <Popover
      opened={isOpened}
      onChange={(next) => !next && close()}
      position="bottom-end"
      shadow="md"
    >
      <Popover.Target>
        <Tooltip label={settingsLabel}>
          <ActionIcon aria-label={settingsLabel} onClick={toggle}>
            <Icon name="gear" />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p="md" w={260}>
        <Stack gap="sm">
          {rows.map(({ key, label }) => (
            <Select
              key={key}
              label={label}
              data={data}
              value={
                findFieldById(historyTable, values[key]) != null
                  ? String(values[key])
                  : null
              }
              disabled={readOnly}
              comboboxProps={{ withinPortal: false }}
              onChange={(next) =>
                setHistoryBinding(historyTable, {
                  [key]: next != null ? Number(next) : null,
                })
              }
            />
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
