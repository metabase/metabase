import { useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Checkbox,
  FixedSizeIcon,
  Group,
  Modal,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { ConcreteTableId, Table } from "metabase-types/api";

import { TOOLTIP_OPEN_DELAY_MS } from "../../../constants";
import { COMPACT_ZOOM_THRESHOLD } from "../constants";
import { useIsCompactMode } from "../SchemaViewerContext";
import type { SchemaViewerFlowNode } from "../types";
import { getNodesWithPositions } from "../utils";

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
  const { fitView, getNodes, getEdges, setNodes } =
    useReactFlow<SchemaViewerFlowNode>();
  const isCompactMode = useIsCompactMode();
  const [opened, setOpened] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Snapshot of selected and visible IDs when dropdown opened - used for stable sorting
  const [selectedSnapshot, setSelectedSnapshot] = useState<
    Set<ConcreteTableId>
  >(new Set());
  const [visibleSnapshot, setVisibleSnapshot] = useState<Set<ConcreteTableId>>(
    new Set(),
  );

  // Map of table ID to flow node (for focus functionality)
  const nodesByTableId = useMemo(() => {
    const map = new Map<ConcreteTableId, SchemaViewerFlowNode>();
    for (const node of nodes) {
      map.set(node.data.table_id as ConcreteTableId, node);
    }
    return map;
  }, [nodes]);

  const handleOpen = useCallback(() => {
    setSelectedSnapshot(new Set(selectedTableIds));
    setVisibleSnapshot(new Set(nodesByTableId.keys()));
    setOpened(true);
  }, [selectedTableIds, nodesByTableId]);

  const handleClose = useCallback(() => {
    setSearchQuery("");
    setOpened(false);
  }, []);

  const handlePopoverToggle = useCallback(() => {
    if (opened) {
      handleClose();
    } else {
      handleOpen();
    }
  }, [opened, handleClose, handleOpen]);

  const containerRef = useRef<HTMLDivElement>(null);

  const selectedTableIdSet = useMemo(
    () => new Set(selectedTableIds),
    [selectedTableIds],
  );

  // Use snapshots when open, current values when closed
  const activeSelectedSet = opened ? selectedSnapshot : selectedTableIdSet;
  const activeVisibleSet = useMemo(
    () => (opened ? visibleSnapshot : new Set(nodesByTableId.keys())),
    [opened, visibleSnapshot, nodesByTableId],
  );

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
    // Sort: selected first, then visible (not selected), then others
    return [...tables].sort((a, b) => {
      const aId = a.id as ConcreteTableId;
      const bId = b.id as ConcreteTableId;
      const aSelected = activeSelectedSet.has(aId);
      const bSelected = activeSelectedSet.has(bId);
      const aVisible = activeVisibleSet.has(aId);
      const bVisible = activeVisibleSet.has(bId);

      // Selected tables first
      if (aSelected && !bSelected) {
        return -1;
      }
      if (!aSelected && bSelected) {
        return 1;
      }
      // If both selected or both not selected, visible tables next
      if (!aSelected && !bSelected) {
        if (aVisible && !bVisible) {
          return -1;
        }
        if (!aVisible && bVisible) {
          return 1;
        }
      }
      return 0;
    });
  }, [activeSelectedSet, activeVisibleSet, allTables, searchQuery]);

  const handleFocus = useCallback(
    (tableId: ConcreteTableId) => {
      const node = nodesByTableId.get(tableId);
      if (!node) {
        return;
      }

      if (isCompactMode) {
        // Recalculate layout for regular mode first, then fit view
        const currentNodes = getNodes();
        const edges = getEdges();
        const newNodes = getNodesWithPositions(currentNodes, edges, false);
        setNodes(newNodes);
        const targetNode = newNodes.find((n) => n.id === node.id);
        if (targetNode) {
          fitView({
            nodes: [targetNode],
            duration: 300,
            padding: 0.5,
            minZoom: COMPACT_ZOOM_THRESHOLD,
          });
        }
      } else {
        fitView({ nodes: [node], duration: 300, padding: 0.5 });
      }
    },
    [nodesByTableId, fitView, isCompactMode, getNodes, getEdges, setNodes],
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

  const [showSelectAllWarning, setShowSelectAllWarning] = useState(false);

  // Use capturing mousedown listener to close dropdown before ReactFlow intercepts the event
  useEffect(() => {
    if (!opened || showSelectAllWarning) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        handleClose();
      }
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [opened, showSelectAllWarning, handleClose]);

  const handleSelectAllClick = useCallback(
    (checked: boolean) => {
      if (checked) {
        setShowSelectAllWarning(true);
      } else {
        onSelectionChange([]);
      }
    },
    [onSelectionChange],
  );

  const handleConfirmSelectAll = useCallback(() => {
    onSelectionChange(allTables.map((t) => t.id as ConcreteTableId));
    setShowSelectAllWarning(false);
    handleClose();
  }, [allTables, onSelectionChange, handleClose]);

  const handleCancelSelectAll = useCallback(() => {
    setShowSelectAllWarning(false);
  }, []);

  if (allTables.length === 0) {
    return null;
  }

  const selectedCount = selectedTableIds.length;
  const allSelected = selectedCount === allTables.length;
  const someSelected = selectedCount > 0 && selectedCount < allTables.length;

  return (
    <Box ref={containerRef}>
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
            onClick={handlePopoverToggle}
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
                    onChange={(e) =>
                      handleSelectAllClick(e.currentTarget.checked)
                    }
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

      <Modal
        opened={showSelectAllWarning}
        onClose={handleCancelSelectAll}
        title={t`Select all tables?`}
        size="sm"
      >
        <Stack gap="lg">
          <Text>
            {t`Selecting all tables may result in slow performance and delayed rendering, especially for large databases.`}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={handleCancelSelectAll}>
              {t`Cancel`}
            </Button>
            <Button onClick={handleConfirmSelectAll}>{t`Select all`}</Button>
          </Group>
        </Stack>
      </Modal>
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
