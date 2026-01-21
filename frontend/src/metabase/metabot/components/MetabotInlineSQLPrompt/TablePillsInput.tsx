import { useMemo, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useListTablesQuery } from "metabase/api";
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

interface TablePillsInputProps {
  databaseId: DatabaseId | null;
  selectedTableIds: TableId[];
  onChange: (tableIds: TableId[]) => void;
  autoFocus?: boolean;
}

export function TablePillsInput({
  databaseId,
  selectedTableIds,
  onChange,
  autoFocus = false,
}: TablePillsInputProps) {
  const [search, setSearch] = useState("");
  const [selectedPillId, setSelectedPillId] = useState<TableId | null>(null);

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => {
      setSelectedPillId(null);
      combobox.selectFirstOption();
    },
  });

  const {
    data: tables,
    isLoading,
    error,
  } = useListTablesQuery(
    databaseId
      ? {
          dbId: databaseId,
          include_hidden: false,
        }
      : skipToken,
  );

  const filteredTables = useMemo(() => {
    if (!tables || !databaseId) {
      return [];
    }
    return tables.filter((table) => table.active && table.db_id === databaseId);
  }, [tables, databaseId]);

  const tableMap = useMemo(
    () => _.indexBy(filteredTables, (table) => table.id),
    [filteredTables],
  );

  const searchFilteredTables = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    if (!searchLower) {
      return filteredTables;
    }
    return filteredTables.filter((table) => {
      const displayName = (table.display_name || table.name).toLowerCase();
      const schema = (table.schema || "").toLowerCase();
      return displayName.includes(searchLower) || schema.includes(searchLower);
    });
  }, [filteredTables, search]);

  const handleValueSelect = (tableIdStr: string) => {
    const tableId = Number(tableIdStr) as TableId;
    if (selectedTableIds.includes(tableId)) {
      onChange(selectedTableIds.filter((id) => id !== tableId));
    } else {
      onChange([...selectedTableIds, tableId]);
    }
    setSearch("");
    setTimeout(() => combobox.selectFirstOption(), 0);
  };

  const handleValueRemove = (tableId: TableId) => {
    onChange(selectedTableIds.filter((id) => id !== tableId));
  };

  const handlePillClick = (tableId: TableId) => {
    setSelectedPillId((prev) => (prev === tableId ? null : tableId));
    combobox.closeDropdown();
  };

  const placeholder =
    selectedTableIds.length > 0
      ? ""
      : t`First, tell Metabot which tables to use`;

  const pills = selectedTableIds.map((tableId) => {
    const table = tableMap[tableId];
    const label = table?.display_name || table?.name || String(tableId);
    const isSelected = selectedPillId === tableId;
    return (
      <Pill
        key={tableId}
        fz="xs"
        bg={isSelected ? "background-brand" : "background-secondary"}
        c="text-primary"
        bd={
          isSelected
            ? "1px solid var(--mb-color-brand)"
            : "1px solid var(--mb-color-border)"
        }
        onClick={() => handlePillClick(tableId)}
        style={{ cursor: "pointer" }}
      >
        {label}
      </Pill>
    );
  });

  const options = searchFilteredTables
    .filter((table) => !selectedTableIds.includes(table.id))
    .map((table) => (
      <Combobox.Option value={String(table.id)} key={table.id}>
        <Group gap="sm">
          <Box component="span" fz="xs">
            {table.display_name || table.name}
            {table.schema && (
              <Box component="span" c="text-tertiary" ml="sm">
                {table.schema}
              </Box>
            )}
          </Box>
        </Group>
      </Combobox.Option>
    ));

  const isDisabled = !databaseId || isLoading || !!error;

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
              onClick={() => !isDisabled && combobox.openDropdown()}
              data-testid="metabot-table-input"
              fz="xs"
            >
              <Pill.Group style={{ gap: "0.25rem" }}>
                {pills}
                <Combobox.EventsTarget>
                  <PillsInput.Field
                    onFocus={() => !isDisabled && combobox.openDropdown()}
                    onBlur={() => combobox.closeDropdown()}
                    value={search}
                    placeholder={placeholder}
                    fz="xs"
                    onChange={(event) => {
                      setSelectedPillId(null);
                      combobox.updateSelectedOptionIndex();
                      setSearch(event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Backspace" &&
                        search.length === 0 &&
                        selectedTableIds.length > 0
                      ) {
                        event.preventDefault();
                        if (selectedPillId !== null) {
                          const currentIndex =
                            selectedTableIds.indexOf(selectedPillId);
                          handleValueRemove(selectedPillId);

                          // Select previous pill, or next one if deleting the first
                          if (currentIndex > 0) {
                            setSelectedPillId(
                              selectedTableIds[currentIndex - 1],
                            );
                          } else if (selectedTableIds.length > 1) {
                            setSelectedPillId(selectedTableIds[1]);
                          } else {
                            setSelectedPillId(null);
                          }
                        } else {
                          handleValueRemove(
                            selectedTableIds[selectedTableIds.length - 1],
                          );
                        }
                      }
                    }}
                    disabled={isDisabled}
                    autoFocus={autoFocus}
                    aria-label={t`Select tables`}
                  />
                </Combobox.EventsTarget>
              </Pill.Group>
            </PillsInput>
          </Combobox.DropdownTarget>

          <Combobox.Dropdown key={selectedTableIds.join("-")}>
            <Combobox.Options>
              {match({
                isLoading,
                error: !!error,
                hasOptions: options.length > 0,
              })
                .with({ hasOptions: true }, () => options)
                .with({ isLoading: true }, () => (
                  <Combobox.Empty>{t`Loading tables...`}</Combobox.Empty>
                ))
                .with({ error: true }, () => (
                  <Combobox.Empty>{t`Error loading tables`}</Combobox.Empty>
                ))
                .otherwise(() => (
                  <Combobox.Empty>{t`No tables found`}</Combobox.Empty>
                ))}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
      </Box>
    </Flex>
  );
}
