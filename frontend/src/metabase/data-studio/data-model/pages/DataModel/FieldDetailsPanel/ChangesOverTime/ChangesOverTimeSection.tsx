import { useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import {
  type VersionChoice,
  findColumnByName,
  getHistoryTableCandidates,
  getTableRoleLabel,
  useChangingAttributes,
  useSchemaTables,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Anchor, Group, Icon, Select, Stack } from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";

import { ColumnSelect } from "./ColumnSelect";
import { InfoIcon } from "./LabelWithInfo";
import { getTableMetadataUrl, useIsHistoryTable } from "./history-tables";
import { singularName } from "./names";

const NOT_TRACKED = "none";

const getValueUsedOptions = (): { value: VersionChoice; label: string }[] => [
  { value: "at-event", label: t`At the time of each row` },
  { value: "current", label: t`Today's value` },
];

type ChangesOverTimeSectionProps = {
  field: Field;
  table: Table;
  disabled: boolean;
};

/**
 * PROTOTYPE: mocked. Whether a field's old values are kept, in which
 * history table and column, and which value tables that link here use.
 * Picking a table that isn't a history table asks before making it one.
 */
export function ChangesOverTimeSection({
  field,
  table,
  disabled,
}: ChangesOverTimeSectionProps) {
  const { tables } = useSchemaTables(table);
  const isHistoryTable = useIsHistoryTable();
  const { getTableStructure, setTableRole } = useTableStructures();
  const { getAttribute, setAttribute } = useChangingAttributes();
  const [tableToConvert, setTableToConvert] = useState<Table>();
  const attribute = getAttribute(field, table, tables);
  const historyTables = getHistoryTableCandidates(
    table,
    tables,
    isHistoryTable,
  );
  const otherTables = tables.filter(
    (other) =>
      other.id !== table.id &&
      !historyTables.some((candidate) => candidate.id === other.id),
  );
  const currentTable =
    attribute.source === "history-table"
      ? tables.find((other) => other.id === attribute.historyTableId)
      : undefined;
  const fieldName = field.display_name;
  const entityName = singularName(table.display_name).toLowerCase();
  const valueUsedOptions = getValueUsedOptions();
  const toOption = (other: Table) => ({
    value: String(other.id),
    label: other.display_name,
  });

  const keepIn = (next: Table) => {
    const column = findColumnByName(next, field);
    setAttribute(field, {
      source: "history-table",
      historyTableId: next.id,
      valueFieldId: column ? getRawTableFieldId(column) : null,
    });
  };

  const convertAndKeepIn = (next: Table) => {
    setTableRole(next, "role/HistoryDimension");
    keepIn(next);
    setTableToConvert(undefined);
  };

  const currentRole = tableToConvert && getTableStructure(tableToConvert).role;

  return (
    <SidebarSection
      title={t`Changes over time`}
      description={t`Whether old values of ${fieldName} are kept, and which one questions use.`}
    >
      <Stack gap="sm">
        <DetailsTable>
          <DetailsRow
            label={t`Old values table`}
            labelAside={
              <InfoIcon
                info={t`Where earlier values of ${fieldName} are kept when a ${entityName}'s ${fieldName.toLowerCase()} changes: a history table, with one row per version and the dates each version was true.`}
              />
            }
            fillValue
            value={
              <Select
                aria-label={t`Old values table`}
                classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
                searchable
                data={[
                  {
                    group: "",
                    items: [{ value: NOT_TRACKED, label: t`Not tracked` }],
                  },
                  {
                    group: t`History tables`,
                    items: historyTables.map(toOption),
                  },
                  { group: t`Other tables`, items: otherTables.map(toOption) },
                ]}
                value={currentTable ? String(currentTable.id) : NOT_TRACKED}
                disabled={disabled}
                onChange={(value) => {
                  const next = tables.find(
                    (other) => String(other.id) === value,
                  );
                  if (next == null) {
                    setAttribute(field, {
                      source: "none",
                      historyTableId: null,
                    });
                  } else if (isHistoryTable(next)) {
                    keepIn(next);
                  } else {
                    setTableToConvert(next);
                  }
                }}
              />
            }
          />
          {currentTable != null && (
            <DetailsRow
              label={t`Stored as`}
              labelAside={
                <InfoIcon
                  info={t`The column in ${currentTable.display_name} that holds earlier values of ${fieldName}.`}
                />
              }
              fillValue
              value={
                <ColumnSelect
                  label={t`Stored as`}
                  fields={currentTable.fields ?? []}
                  value={attribute.valueFieldId}
                  placeholder={t`Pick its column`}
                  disabled={disabled}
                  onChange={(valueFieldId) =>
                    setAttribute(field, { valueFieldId })
                  }
                />
              }
            />
          )}
          {currentTable != null && (
            <DetailsRow
              label={t`Value used in other tables`}
              labelAside={
                <InfoIcon
                  info={t`When a table that links to ${table.display_name} is grouped by ${fieldName}: use the value the ${entityName} had at that row's date, or today's value for every row.`}
                />
              }
              fillValue
              value={
                <Select
                  aria-label={t`Value used in other tables`}
                  classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
                  data={valueUsedOptions}
                  value={attribute.defaultVersion}
                  disabled={disabled}
                  onChange={(value) => {
                    const option = valueUsedOptions.find(
                      (option) => option.value === value,
                    );
                    if (option) {
                      setAttribute(field, { defaultVersion: option.value });
                    }
                  }}
                />
              }
            />
          )}
        </DetailsTable>
        {currentTable != null && (
          <Anchor
            component={Link}
            to={getTableMetadataUrl(currentTable)}
            size="sm"
            w="fit-content"
          >
            <Group gap="xs" wrap="nowrap">
              {t`Open ${currentTable.display_name}`}
              <Icon name="arrow_right" size={12} />
            </Group>
          </Anchor>
        )}
      </Stack>
      <ConfirmModal
        opened={tableToConvert != null}
        title={t`Make ${tableToConvert?.display_name ?? ""} a history table?`}
        message={
          currentRole
            ? t`Its role changes from ${getTableRoleLabel(currentRole)} to History. Each of its rows will be read as an older version of a ${entityName}, matched by a key and the dates it was true. You can check those on its Metadata tab.`
            : t`Its role becomes History. Each of its rows will be read as an older version of a ${entityName}, matched by a key and the dates it was true. You can check those on its Metadata tab.`
        }
        confirmButtonText={t`Make it a history table`}
        confirmButtonProps={{ color: "brand" }}
        onConfirm={() => tableToConvert && convertAndKeepIn(tableToConvert)}
        onClose={() => setTableToConvert(undefined)}
      />
    </SidebarSection>
  );
}
