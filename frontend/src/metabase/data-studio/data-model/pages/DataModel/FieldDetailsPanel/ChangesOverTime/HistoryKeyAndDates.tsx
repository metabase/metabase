import { useDisclosure } from "@mantine/hooks";
import { jt, t } from "ttag";

import {
  type HistoryBinding,
  findFieldById,
  inferBindingForHistoryTable,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { Anchor, Popover, Text } from "metabase/ui";
import type { FieldId, Table } from "metabase-types/api";

import { InlineFieldSelect } from "./InlineSelect";

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
 * PROTOTYPE: mocked. How a history table's rows line up with its dimension,
 * as one line. Metabase guesses it; "Change" edits it in place, so there's
 * no History tab to visit.
 */
export function HistoryKeyAndDates({
  dimensionTable,
  historyTable,
  readOnly,
}: HistoryKeyAndDatesProps) {
  const [isEditing, { toggle, close }] = useDisclosure(false);
  const { getTableStructure, setHistoryBinding } = useTableStructures();
  const inferred = inferBindingForHistoryTable(dimensionTable, historyTable);
  const binding = getTableStructure(historyTable).history;
  const fields = historyTable.fields ?? [];
  const values: Record<BindingKey, FieldId | null> = {
    durableKeyFieldId: binding.durableKeyFieldId ?? inferred.keyFieldId,
    validFromFieldId: binding.validFromFieldId ?? inferred.validFromFieldId,
    validToFieldId: binding.validToFieldId ?? inferred.validToFieldId,
  };
  const nameOf = (key: BindingKey) =>
    findFieldById(historyTable, values[key])?.display_name ?? t`nothing`;
  const fieldSelect = (key: BindingKey, label: string) => (
    <InlineFieldSelect
      key={key}
      label={label}
      fields={fields}
      value={values[key]}
      disabled={readOnly}
      withinPortal={false}
      onChange={(fieldId) =>
        setHistoryBinding(historyTable, { [key]: fieldId })
      }
    />
  );

  return (
    <Text size="sm" c="text-secondary">
      {jt`In ${(
        <strong key="table">{historyTable.display_name}</strong>
      )}, matched on ${(
        <strong key="key">{nameOf("durableKeyFieldId")}</strong>
      )}, true from ${(
        <strong key="from">{nameOf("validFromFieldId")}</strong>
      )} until ${<strong key="to">{nameOf("validToFieldId")}</strong>}.`}{" "}
      {!readOnly && (
        <Popover
          opened={isEditing}
          onChange={(isOpened) => !isOpened && close()}
          position="bottom-start"
          shadow="md"
        >
          <Popover.Target>
            <Anchor component="button" size="sm" onClick={toggle}>
              {t`Change`}
            </Anchor>
          </Popover.Target>
          <Popover.Dropdown p="lg" maw={520}>
            <Text lh={2.4}>
              {jt`Rows of ${(
                <strong key="table">{historyTable.display_name}</strong>
              )} are matched on ${fieldSelect("durableKeyFieldId", t`Matched on`)} and true from ${fieldSelect("validFromFieldId", t`True from`)} until ${fieldSelect("validToFieldId", t`True until`)}.`}
            </Text>
          </Popover.Dropdown>
        </Popover>
      )}
    </Text>
  );
}
