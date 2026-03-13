import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  useGetTableQueryMetadataQuery,
  useListTablesQuery,
} from "metabase/api";
import {
  Box,
  Button,
  Flex,
  Icon,
  Modal,
  Popover,
  Text,
  TextInput,
} from "metabase/ui";
import type { DatabaseId, Field, Table } from "metabase-types/api";

import type { AdhocAggregationOperator } from "../../utils/adhoc-definition";
import { buildAdhocDisplayName } from "../../utils/adhoc-definition";

import S from "./SummarizeTableDialog.module.css";

type AdhocResult = {
  uuid: string;
  databaseId: number;
  tableId: number;
  tableName: string;
  aggregationOperator: AdhocAggregationOperator;
  column?: Field;
  displayName: string;
};

type SummarizeTableDialogProps = {
  opened: boolean;
  onClose: () => void;
  onAdd: (result: AdhocResult) => void;
  databaseId: DatabaseId | null;
};

const AGGREGATION_OPTIONS: {
  operator: AdhocAggregationOperator;
  label: string;
  requiresColumn: boolean;
}[] = [
  { operator: "count", label: "Count of rows", requiresColumn: false },
  { operator: "sum", label: "Sum", requiresColumn: true },
  { operator: "avg", label: "Average", requiresColumn: true },
  { operator: "min", label: "Min", requiresColumn: true },
  { operator: "max", label: "Max", requiresColumn: true },
  { operator: "distinct", label: "Distinct values", requiresColumn: true },
];

function isNumericField(field: Field): boolean {
  const effectiveType = field.effective_type ?? field.base_type;
  return (
    effectiveType.startsWith("type/Integer") ||
    effectiveType.startsWith("type/Float") ||
    effectiveType.startsWith("type/Decimal") ||
    effectiveType.startsWith("type/Number") ||
    effectiveType === "type/BigInteger"
  );
}

function isAggregatable(
  field: Field,
  operator: AdhocAggregationOperator,
): boolean {
  if (
    !field.active ||
    field.visibility_type !== "normal" ||
    typeof field.id !== "number"
  ) {
    return false;
  }
  if (operator === "sum" || operator === "avg") {
    return isNumericField(field);
  }
  return true;
}

function isBreakoutEligible(field: Field): boolean {
  return (
    field.active &&
    field.visibility_type === "normal" &&
    typeof field.id === "number"
  );
}

function isTemporalField(field: Field): boolean {
  const effectiveType = field.effective_type ?? field.base_type;
  return (
    effectiveType.startsWith("type/Date") ||
    effectiveType.startsWith("type/DateTime") ||
    effectiveType.startsWith("type/Temporal")
  );
}

// ── Table Picker Step ──

function TablePickerStep({
  databaseId,
  onSelectTable,
  onClose,
}: {
  databaseId: DatabaseId | null;
  onSelectTable: (table: Table) => void;
  onClose: () => void;
}) {
  const [searchText, setSearchText] = useState("");
  const { data: allTables, isLoading } = useListTablesQuery();

  const tables = useMemo(() => {
    if (!allTables) {
      return [];
    }
    return allTables.filter((table) => {
      if (databaseId != null && table.db_id !== databaseId) {
        return false;
      }
      if (table.visibility_type !== null) {
        return false;
      }
      if (searchText) {
        return table.display_name
          .toLowerCase()
          .includes(searchText.toLowerCase());
      }
      return true;
    });
  }, [allTables, databaseId, searchText]);

  return (
    <Box className={S.dialog}>
      <Box className={S.header}>
        <Text className={S.headerTitle}>{t`Summarize a table`}</Text>
        <button
          type="button"
          className={S.headerButton}
          onClick={onClose}
          aria-label={t`Close`}
        >
          <Icon name="close" size={16} />
        </button>
      </Box>
      <Box className={S.searchWrapper}>
        <TextInput
          placeholder={t`Search tables`}
          leftSection={<Icon name="search" size={14} />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          autoFocus
        />
      </Box>
      <Box className={S.tableList}>
        {isLoading && (
          <Text c="text-secondary" p="md" ta="center">
            {t`Loading...`}
          </Text>
        )}
        {!isLoading && tables.length === 0 && (
          <Text c="text-secondary" p="md" ta="center">
            {t`No tables found`}
          </Text>
        )}
        {tables.map((table) => (
          <button
            key={table.id}
            type="button"
            className={S.tableItem}
            onClick={() => onSelectTable(table)}
          >
            <Icon name="table" size={16} c="text-tertiary" />
            <Text lineClamp={1}>{table.display_name}</Text>
          </button>
        ))}
      </Box>
    </Box>
  );
}

// ── Configuration Step ──

function ConfigurationStep({
  table,
  onBack,
  onClose,
  onAdd,
}: {
  table: Table;
  onBack: () => void;
  onClose: () => void;
  onAdd: (result: AdhocResult) => void;
}) {
  const [selectedOperator, setSelectedOperator] =
    useState<AdhocAggregationOperator | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<Field | null>(null);
  const [selectedGroupBy, setSelectedGroupBy] = useState<Field | null>(null);
  const [aggPickerOpen, setAggPickerOpen] = useState(false);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [groupByPickerOpen, setGroupByPickerOpen] = useState(false);

  const { data: tableWithFields } = useGetTableQueryMetadataQuery({
    id: table.id as number,
  });

  const fields = useMemo(
    () => tableWithFields?.fields ?? table.fields ?? [],
    [tableWithFields?.fields, table.fields],
  );

  const currentAggOption = selectedOperator
    ? AGGREGATION_OPTIONS.find((o) => o.operator === selectedOperator)
    : null;

  const aggregatableFields = useMemo(
    () =>
      selectedOperator
        ? fields.filter((f) => isAggregatable(f, selectedOperator))
        : [],
    [fields, selectedOperator],
  );

  const breakoutFields = useMemo(
    () => fields.filter(isBreakoutEligible),
    [fields],
  );

  // Auto-select first temporal field as group-by when fields load
  useMemo(() => {
    if (breakoutFields.length > 0 && selectedGroupBy === null) {
      const temporalField = breakoutFields.find(isTemporalField);
      if (temporalField) {
        setSelectedGroupBy(temporalField);
      }
    }
  }, [breakoutFields, selectedGroupBy]);

  const canAdd =
    selectedOperator != null &&
    (!currentAggOption?.requiresColumn || selectedColumn != null);

  const handleAdd = useCallback(() => {
    if (!selectedOperator || !canAdd) {
      return;
    }

    const displayName = buildAdhocDisplayName(
      selectedOperator,
      table.display_name,
      selectedColumn?.display_name,
    );

    onAdd({
      uuid: crypto.randomUUID(),
      databaseId: table.db_id,
      tableId: table.id as number,
      tableName: table.display_name,
      aggregationOperator: selectedOperator,
      column: selectedColumn ?? undefined,
      displayName,
    });
  }, [selectedOperator, selectedColumn, canAdd, table, onAdd]);

  return (
    <Box className={S.dialog}>
      <Box className={S.header}>
        <button
          type="button"
          className={S.headerButton}
          onClick={onBack}
          aria-label={t`Back`}
        >
          <Icon name="chevronleft" size={16} />
        </button>
        <Text className={S.headerTitle}>{table.display_name}</Text>
        <button
          type="button"
          className={S.headerButton}
          onClick={onClose}
          aria-label={t`Close`}
        >
          <Icon name="close" size={16} />
        </button>
      </Box>

      <Box className={S.body}>
        {/* Summarize section */}
        <Box className={S.section}>
          <Text className={S.sectionTitle}>{t`Summarize`}</Text>

          {/* Aggregation picker */}
          <Popover
            opened={aggPickerOpen}
            onChange={setAggPickerOpen}
            position="bottom-start"
            shadow="md"
            withinPortal
          >
            <Popover.Target>
              <Flex
                className={`${S.pickerRow} ${currentAggOption?.requiresColumn ? S.connectedTop : ""}`}
                onClick={() => setAggPickerOpen((o) => !o)}
              >
                <Icon name="formula" size={16} c="text-tertiary" />
                <Text
                  className={S.pickerRowText}
                  c={selectedOperator ? "text-primary" : "text-secondary"}
                >
                  {currentAggOption?.label ?? t`Pick how to summarize`}
                </Text>
                <Icon name="chevrondown" size={14} c="text-tertiary" />
              </Flex>
            </Popover.Target>
            <Popover.Dropdown p="xs">
              {AGGREGATION_OPTIONS.map((opt) => (
                <Box
                  key={opt.operator}
                  component="button"
                  className={S.tableItem}
                  data-active={opt.operator === selectedOperator || undefined}
                  onClick={() => {
                    setSelectedOperator(opt.operator);
                    setSelectedColumn(null);
                    setAggPickerOpen(false);
                  }}
                >
                  <Text>{opt.label}</Text>
                </Box>
              ))}
            </Popover.Dropdown>
          </Popover>

          {/* Column picker (connected below aggregation) */}
          <Popover
            opened={colPickerOpen}
            onChange={setColPickerOpen}
            position="bottom-start"
            shadow="md"
            withinPortal
          >
            <Popover.Target>
              <Flex
                className={`${S.pickerRow} ${currentAggOption?.requiresColumn ? S.connectedBottom : ""}`}
                data-disabled={!currentAggOption?.requiresColumn || undefined}
                onClick={() => {
                  if (currentAggOption?.requiresColumn) {
                    setColPickerOpen((o) => !o);
                  }
                }}
              >
                <Icon name="table2" size={16} c="text-tertiary" />
                <Text
                  className={S.pickerRowText}
                  c={
                    !currentAggOption?.requiresColumn
                      ? "text-tertiary"
                      : selectedColumn
                        ? "text-primary"
                        : "text-secondary"
                  }
                >
                  {!currentAggOption?.requiresColumn
                    ? t`in this table`
                    : selectedColumn
                      ? selectedColumn.display_name
                      : t`Pick a column`}
                </Text>
                {currentAggOption?.requiresColumn && (
                  <Icon name="chevrondown" size={14} c="text-tertiary" />
                )}
              </Flex>
            </Popover.Target>
            <Popover.Dropdown p="xs" mah="15rem" style={{ overflowY: "auto" }}>
              {aggregatableFields.map((field) => (
                <Box
                  key={field.id as number}
                  component="button"
                  className={S.tableItem}
                  data-active={field.id === selectedColumn?.id || undefined}
                  onClick={() => {
                    setSelectedColumn(field);
                    setColPickerOpen(false);
                  }}
                >
                  <Text>{field.display_name}</Text>
                </Box>
              ))}
            </Popover.Dropdown>
          </Popover>
        </Box>

        {/* Group by section */}
        <Box className={S.section}>
          <Text className={S.sectionTitle}>{t`Group by`}</Text>
          <Popover
            opened={groupByPickerOpen}
            onChange={setGroupByPickerOpen}
            position="bottom-start"
            shadow="md"
            withinPortal
          >
            <Popover.Target>
              <Flex
                className={S.pickerRow}
                onClick={() => setGroupByPickerOpen((o) => !o)}
              >
                <Icon
                  name={
                    selectedGroupBy && isTemporalField(selectedGroupBy)
                      ? "calendar"
                      : "table2"
                  }
                  size={16}
                  c="text-tertiary"
                />
                <Text
                  className={S.pickerRowText}
                  c={selectedGroupBy ? "text-primary" : "text-secondary"}
                >
                  {selectedGroupBy?.display_name ?? t`Pick a column`}
                </Text>
                <Icon name="chevrondown" size={14} c="text-tertiary" />
              </Flex>
            </Popover.Target>
            <Popover.Dropdown p="xs" mah="15rem" style={{ overflowY: "auto" }}>
              {breakoutFields.map((field) => (
                <Box
                  key={field.id as number}
                  component="button"
                  className={S.tableItem}
                  data-active={field.id === selectedGroupBy?.id || undefined}
                  onClick={() => {
                    setSelectedGroupBy(field);
                    setGroupByPickerOpen(false);
                  }}
                >
                  <Icon
                    name={isTemporalField(field) ? "calendar" : "table2"}
                    size={14}
                    c="text-tertiary"
                  />
                  <Text>{field.display_name}</Text>
                </Box>
              ))}
            </Popover.Dropdown>
          </Popover>
        </Box>
      </Box>

      <Box className={S.footer}>
        <Button
          variant="filled"
          disabled={!canAdd}
          onClick={handleAdd}
          leftSection={<Icon name="add" size={14} />}
        >
          {t`Add to chart`}
        </Button>
      </Box>
    </Box>
  );
}

// ── Main Dialog ──

export function SummarizeTableDialog({
  opened,
  onClose,
  onAdd,
  databaseId,
}: SummarizeTableDialogProps) {
  const [step, setStep] = useState<"table-picker" | "configuration">(
    "table-picker",
  );
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);

  const handleClose = useCallback(() => {
    setStep("table-picker");
    setSelectedTable(null);
    onClose();
  }, [onClose]);

  const handleSelectTable = useCallback((table: Table) => {
    setSelectedTable(table);
    setStep("configuration");
  }, []);

  const handleBack = useCallback(() => {
    setStep("table-picker");
    setSelectedTable(null);
  }, []);

  const handleAdd = useCallback(
    (result: AdhocResult) => {
      onAdd(result);
      handleClose();
    },
    [onAdd, handleClose],
  );

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      withCloseButton={false}
      padding={0}
      size="auto"
      centered
    >
      {step === "table-picker" && (
        <TablePickerStep
          databaseId={databaseId}
          onSelectTable={handleSelectTable}
          onClose={handleClose}
        />
      )}
      {step === "configuration" && selectedTable && (
        <ConfigurationStep
          table={selectedTable}
          onBack={handleBack}
          onClose={handleClose}
          onAdd={handleAdd}
        />
      )}
    </Modal>
  );
}

export type { AdhocResult };
