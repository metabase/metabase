import { useClickOutside, useDisclosure } from "@mantine/hooks";
import { useReactFlow } from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Checkbox,
  FixedSizeIcon,
  Group,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { ConcreteTableId, Table } from "metabase-types/api";

import { TOOLTIP_OPEN_DELAY_MS } from "../../../constants";
import type { SchemaViewerFlowNode } from "../types";

import S from "./TableSelectorInput.module.css";

interface TableSelectorInputProps {
  nodes: SchemaViewerFlowNode[];
  allTables: Table[];
  selectedTableIds: ConcreteTableId[];
  isUserModified: boolean;
  onSelectionChange: (tableIds: ConcreteTableId[]) => void;
}

export function TableSelectorInput({
  nodes,
  allTables,
  selectedTableIds,
  isUserModified,
  onSelectionChange,
}: TableSelectorInputProps) {
  const { fitView } = useReactFlow();
  const [opened, { close, toggle }] = useDisclosure(false);
  const [searchQuery, setSearchQuery] = useState("");
  const clickOutsideRef = useClickOutside(() => {
    if (opened) {
      setSearchQuery("");
      close();
    }
  });

  const selectedTableIdSet = useMemo(
    () => new Set(selectedTableIds),
    [selectedTableIds],
  );

  // Map of table ID to flow node (for focus functionality)
  const nodesByTableId = useMemo(() => {
    const map = new Map<ConcreteTableId, SchemaViewerFlowNode>();
    for (const node of nodes) {
      map.set(node.data.table_id as ConcreteTableId, node);
    }
    return map;
  }, [nodes]);

  const filteredTables = useMemo(() => {
    let tables = allTables;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tables = allTables.filter(
        (table) =>
          table.display_name?.toLowerCase().includes(query) ||
          table.name.toLowerCase().includes(query),
      );
    }
    // Sort selected tables to the top
    return [...tables].sort((a, b) => {
      const aSelected = selectedTableIdSet.has(a.id as ConcreteTableId);
      const bSelected = selectedTableIdSet.has(b.id as ConcreteTableId);
      if (aSelected && !bSelected) {
        return -1;
      }
      if (!aSelected && bSelected) {
        return 1;
      }
      return 0;
    });
  }, [allTables, searchQuery, selectedTableIdSet]);

  const handleFocus = useCallback(
    (tableId: ConcreteTableId) => {
      const node = nodesByTableId.get(tableId);
      if (node) {
        fitView({ nodes: [node], duration: 300, padding: 0.5 });
      }
    },
    [nodesByTableId, fitView],
  );

  const handleToggle = useCallback(
    (tableId: ConcreteTableId, checked: boolean) => {
      if (checked) {
        onSelectionChange([...selectedTableIds, tableId]);
      } else {
        onSelectionChange(selectedTableIds.filter((id) => id !== tableId));
      }
    },
    [selectedTableIds, onSelectionChange],
  );

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        onSelectionChange(allTables.map((t) => t.id as ConcreteTableId));
      } else {
        onSelectionChange([]);
      }
    },
    [allTables, onSelectionChange],
  );

  const handleClose = () => {
    setSearchQuery("");
    close();
  };

  if (allTables.length === 0) {
    return null;
  }

  const selectedCount = selectedTableIds.length;
  const allSelected = selectedCount === allTables.length;
  const someSelected = selectedCount > 0 && selectedCount < allTables.length;

  return (
    <Box ref={clickOutsideRef}>
      <Popover
        opened={opened}
        onClose={handleClose}
        withinPortal={false}
        position="bottom-start"
        shadow="md"
        width={320}
      >
        <Popover.Target>
          <Button
            className={S.triggerButton}
            bg="background-primary"
            variant="default"
            leftSection={<FixedSizeIcon name="table" />}
            rightSection={<FixedSizeIcon name="chevrondown" />}
            data-testid="table-selector-button"
            onClick={toggle}
          >
            {isUserModified
              ? t`${selectedCount} tables selected`
              : t`Most relationships`}
          </Button>
        </Popover.Target>

        <Popover.Dropdown p={0}>
          <Stack gap={0}>
            <Box p="sm">
              <TextInput
                placeholder={t`Search the list`}
                value={searchQuery}
                autoFocus
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
              />
            </Box>
            <Stack gap={0} className={S.tableList} px="sm" pb="sm">
              {!searchQuery && (
                <Group
                  className={S.listItem}
                  gap="sm"
                  wrap="nowrap"
                  justify="space-between"
                >
                  <Checkbox
                    label={t`Select all`}
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={(e) => handleSelectAll(e.currentTarget.checked)}
                    classNames={{ label: S.checkboxLabel }}
                  />
                </Group>
              )}
              {filteredTables.length === 0 ? (
                <Text c="text-tertiary" ta="center" py="md">
                  {t`No tables found`}
                </Text>
              ) : (
                filteredTables.map((table) => (
                  <TableListItem
                    key={table.id}
                    table={table}
                    isSelected={selectedTableIdSet.has(
                      table.id as ConcreteTableId,
                    )}
                    isVisible={nodesByTableId.has(table.id as ConcreteTableId)}
                    onToggle={handleToggle}
                    onFocus={handleFocus}
                  />
                ))
              )}
            </Stack>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
}

interface TableListItemProps {
  table: Table;
  isSelected: boolean;
  isVisible: boolean;
  onToggle: (tableId: ConcreteTableId, checked: boolean) => void;
  onFocus: (tableId: ConcreteTableId) => void;
}

function TableListItem({
  table,
  isSelected,
  isVisible,
  onToggle,
  onFocus,
}: TableListItemProps) {
  const displayName = table.display_name || table.name;
  const tableId = table.id as ConcreteTableId;
  const labelClass = isSelected
    ? S.checkboxLabelBold
    : isVisible
      ? S.checkboxLabel
      : S.checkboxLabelTertiary;

  return (
    <Group
      className={S.listItem}
      gap="sm"
      wrap="nowrap"
      justify="space-between"
    >
      <Checkbox
        label={displayName}
        checked={isSelected}
        onChange={(e) => onToggle(tableId, e.currentTarget.checked)}
        classNames={{ label: labelClass }}
      />
      {isVisible && (
        <Tooltip label={t`Focus table`} openDelay={TOOLTIP_OPEN_DELAY_MS}>
          <UnstyledButton
            className={S.focusButton}
            onClick={() => onFocus(tableId)}
            aria-label={t`Focus ${displayName}`}
          >
            <FixedSizeIcon name="eye_outline" c="text-tertiary" />
          </UnstyledButton>
        </Tooltip>
      )}
    </Group>
  );
}
