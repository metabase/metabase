import { useEffect, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { skipToken, useSearchQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import {
  Box,
  Combobox,
  Flex,
  Group,
  Icon,
  Pill,
  PillsInput,
  useCombobox,
} from "metabase/ui";
import type { DatabaseId, TableId } from "metabase-types/api";

import S from "./TablePillsInput.module.css";

export interface SelectedTable {
  id: TableId;
  name: string;
}

interface TablePillsInputProps {
  databaseId: DatabaseId | null;
  selectedTables: SelectedTable[];
  onChange: (tables: SelectedTable[]) => void;
  autoFocus?: boolean;
}

export function TablePillsInput({
  databaseId,
  selectedTables,
  onChange,
  autoFocus = false,
}: TablePillsInputProps) {
  const [search, setSearch] = useState("");
  const [focusedTableId, setFocusedTableId] = useState<TableId | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);
  const {
    data: searchData,
    isLoading,
    error,
  } = useSearchQuery(
    databaseId
      ? {
          q: debouncedSearch.trim() || undefined,
          models: ["table"],
          table_db_id: databaseId,
          limit: 20,
        }
      : skipToken,
  );
  const tables = useMemo(() => searchData?.data ?? [], [searchData]);
  const tableOptions = useMemo(() => {
    const selectedIds = new Set(selectedTables.map((t) => t.id));
    return tables.filter(
      (table) => table.id != null && !selectedIds.has(table.id as TableId),
    );
  }, [tables, selectedTables]);

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => {
      setFocusedTableId(null);
      combobox.selectFirstOption();
    },
  });

  useEffect(() => {
    if (combobox.dropdownOpened && tableOptions.length > 0) {
      combobox.selectFirstOption();
    }
  }, [tableOptions, combobox]);

  const handleValueSelect = (tableIdStr: string) => {
    const tableId = Number(tableIdStr) as TableId;
    const table = tables.find((t) => t.id === tableId);
    if (table) {
      onChange([...selectedTables, { id: tableId, name: table.name }]);
    }
    combobox.closeDropdown();
    setSearch("");
  };

  const handleRemoveTable = (tableId: TableId) => {
    onChange(selectedTables.filter((t) => t.id !== tableId));
  };

  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!combobox.dropdownOpened) {
      combobox.openDropdown();
    }
    setFocusedTableId(null);
    setSearch(e.currentTarget.value);
  };

  const handlePillClick = (tableId: TableId) => {
    setFocusedTableId((prev) => (prev === tableId ? null : tableId));
    combobox.closeDropdown();
  };

  const fallbackMessage = match({
    showLoading: isLoading || debouncedSearch !== search,
    hasError: !!error,
    hasOptions: tableOptions.length > 0,
  })
    .with({ showLoading: true }, () => (
      <Combobox.Empty>{t`Loading tables...`}</Combobox.Empty>
    ))
    .with({ hasError: true }, () => (
      <Combobox.Empty>{t`Error loading tables`}</Combobox.Empty>
    ))
    .with({ hasOptions: false }, () => (
      <Combobox.Empty>{t`No tables found`}</Combobox.Empty>
    ))
    .otherwise(() => undefined);

  return (
    <Flex className={S.root} align="center" gap="sm">
      <Icon name="table" c="text-tertiary" size={14} />
      <Box flex="1">
        <Combobox
          store={combobox}
          onOptionSubmit={handleValueSelect}
          withinPortal={false}
        >
          <Combobox.DropdownTarget>
            <PillsInput
              onClick={() => combobox.openDropdown()}
              data-testid="metabot-table-input"
              fz="xs"
            >
              <Pill.Group style={{ gap: "0.25rem" }}>
                {selectedTables.map((table) => (
                  <Pill
                    key={table.id}
                    fz="xs"
                    bg={
                      focusedTableId === table.id
                        ? "background-brand"
                        : "background-secondary"
                    }
                    c="text-primary"
                    bd={
                      focusedTableId === table.id
                        ? "1px solid var(--mb-color-brand)"
                        : "1px solid var(--mb-color-border)"
                    }
                    onClick={() => handlePillClick(table.id)}
                    style={{ cursor: "pointer" }}
                  >
                    {table.name || String(table.id)}
                  </Pill>
                ))}
                <Combobox.EventsTarget>
                  <PillsInput.Field
                    onBlur={() => combobox.closeDropdown()}
                    value={search}
                    placeholder={t`First, tell Metabot which tables to use`}
                    fz="xs"
                    onChange={handleFieldChange}
                    onKeyDown={(e) => {
                      const isDelete = e.key === "Backspace";
                      const isInputEmpty =
                        search.length === 0 && selectedTables.length > 0;
                      if (!isDelete || !isInputEmpty) {
                        return;
                      }

                      e.preventDefault();

                      const tableId =
                        focusedTableId ?? selectedTables.at(-1)?.id;
                      if (tableId) {
                        handleRemoveTable(tableId);
                        if (focusedTableId) {
                          const currIndex = selectedTables.findIndex(
                            (t) => t.id === tableId,
                          );
                          const nextIndex = currIndex > 0 ? currIndex - 1 : 1;
                          const nextTable = selectedTables[nextIndex];
                          setFocusedTableId(nextTable?.id ?? null);
                        }
                      }
                    }}
                    autoFocus={autoFocus}
                    aria-label={t`Select tables`}
                  />
                </Combobox.EventsTarget>
              </Pill.Group>
            </PillsInput>
          </Combobox.DropdownTarget>

          <Combobox.Dropdown key={selectedTables.map((t) => t.id).join("-")}>
            <Combobox.Options>
              {fallbackMessage ||
                tableOptions.map((table) => (
                  <Combobox.Option value={String(table.id)} key={table.id}>
                    <Group gap="sm">
                      <Box component="span" fz="xs">
                        {table.name}
                        {table.table_schema && (
                          <Box component="span" c="text-tertiary" ml="sm">
                            {table.table_schema}
                          </Box>
                        )}
                      </Box>
                    </Group>
                  </Combobox.Option>
                ))}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
      </Box>
    </Flex>
  );
}
