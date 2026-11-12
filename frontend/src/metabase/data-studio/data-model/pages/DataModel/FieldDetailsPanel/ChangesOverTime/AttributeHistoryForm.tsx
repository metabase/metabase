import { t } from "ttag";

import { SidebarSection } from "metabase/common/components/DetailSidebar";
import {
  findColumnByName,
  getHistoryTableCandidates,
  getVersionChoiceOptions,
  useChangingAttributes,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Radio, Select, Stack } from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

import { DimensionChangePreview, getPreviewNames } from "./EndUserPreview";
import {
  useDimensionHistory,
  useHistoryTableBinding,
  useIsHistoryTable,
} from "./use-dimension-history";

const NOT_KEPT = "none";

type AttributeHistoryFormProps = {
  field: Field;
  table: Table;
  disabled: boolean;
};

/**
 * PROTOTYPE: mocked. The attribute's history as a plain form: where old
 * values are kept, and which one people get, each with its own explanation.
 */
export function AttributeHistoryForm({
  field,
  table,
  disabled,
}: AttributeHistoryFormProps) {
  const history = useDimensionHistory(table);
  const isHistoryTable = useIsHistoryTable();
  const getBinding = useHistoryTableBinding();
  const { getAttribute, setAttribute } = useChangingAttributes();
  const attribute = getAttribute(field, table, history.tables);
  const candidates = getHistoryTableCandidates(
    table,
    history.tables,
    isHistoryTable,
  ).filter((candidate) => findColumnByName(candidate, field) != null);
  const historyTable =
    attribute.source === "history-table"
      ? candidates.find((other) => other.id === attribute.historyTableId)
      : undefined;
  const names = getPreviewNames(history, table, field);
  const attributeName = field.display_name.toLowerCase();
  const options = getVersionChoiceOptions(
    attributeName,
    names.fact.toLowerCase(),
    names.eventDate.toLowerCase(),
  );

  return (
    <SidebarSection title={t`Changes over time`}>
      <Stack gap="xl">
        <Select
          label={t`Old values`}
          description={
            historyTable
              ? undefined
              : t`When a ${attributeName} changes, the old one is overwritten.`
          }
          inputWrapperOrder={["label", "input", "description"]}
          data={[
            { value: NOT_KEPT, label: t`Not kept` },
            ...candidates.map((candidate) => ({
              value: String(candidate.id),
              label: t`Kept in ${candidate.display_name}`,
            })),
          ]}
          value={historyTable ? String(historyTable.id) : NOT_KEPT}
          disabled={disabled}
          onChange={(value) => {
            const next = candidates.find(
              (candidate) => String(candidate.id) === value,
            );
            const column = findColumnByName(next, field);
            setAttribute(field, {
              source: next ? "history-table" : "none",
              historyTableId: next?.id ?? null,
              valueFieldId: column ? getRawTableFieldId(column) : null,
            });
          }}
        />
        {historyTable != null && history.reference != null && (
          <Radio.Group
            label={t`When people group ${names.facts} by ${field.display_name}, show`}
            value={attribute.defaultVersion}
            onChange={(value) => {
              const option = options.find((option) => option.value === value);
              if (option) {
                setAttribute(field, { defaultVersion: option.value });
              }
            }}
          >
            <Stack gap="md" mt="sm">
              {options.map((option) => (
                <Radio
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  description={option.description}
                  disabled={disabled}
                />
              ))}
            </Stack>
          </Radio.Group>
        )}
        {historyTable != null && (
          <DimensionChangePreview
            history={{
              ...history,
              historyTable,
              binding: getBinding(table, historyTable),
            }}
            dimensionTable={table}
            attribute={field}
            version={attribute.defaultVersion}
          />
        )}
      </Stack>
    </SidebarSection>
  );
}
