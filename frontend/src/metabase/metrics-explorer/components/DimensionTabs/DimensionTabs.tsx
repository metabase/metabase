import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  AccordionList,
  type Section,
} from "metabase/common/components/AccordionList";
import { useSelector } from "metabase/lib/redux";
import { ActionIcon, Icon, Popover, Tabs } from "metabase/ui";
import type { MetricSourceId } from "metabase-types/store/metrics-explorer";

import {
  selectAvailableColumns,
  selectDimensionTabs,
  selectSourceDataById,
  selectSourceOrder,
} from "../../selectors";
import { ALL_TAB_ID } from "../../utils/tab-registry";
import type { AvailableColumn } from "../../utils/dimensions";
import { getSourceDisplayName } from "../../utils/dimensions";

import S from "./DimensionTabs.module.css";

interface DimensionTabsProps {
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  onAddTab: (columnName: string) => void;
  onRemoveTab: (tabId: string) => void;
}

export function DimensionTabs({
  activeTabId,
  onTabChange,
  onAddTab,
  onRemoveTab,
}: DimensionTabsProps) {
  const allTabs = useSelector(selectDimensionTabs);
  const availableColumns = useSelector(selectAvailableColumns);
  const sourceOrder = useSelector(selectSourceOrder);
  const sourceDataById = useSelector(selectSourceDataById);

  const handleRemoveTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      onRemoveTab(tabId);
    },
    [onRemoveTab],
  );

  const hasSharedColumns = availableColumns.shared.length > 0;
  const hasAnySourceColumns = sourceOrder.some(
    (sourceId) => (availableColumns.bySource[sourceId]?.length ?? 0) > 0,
  );
  const hasAvailableColumns = hasSharedColumns || hasAnySourceColumns;
  const hasMultipleSources = sourceOrder.length > 1;

  const showAllTab = allTabs.length > 1;

  if (allTabs.length <= 1 && !hasAvailableColumns) {
    return null;
  }

  return (
    <Tabs
      value={activeTabId}
      onChange={(value) => value && onTabChange(value)}

      w="auto"
    >
      <Tabs.List className={S.list} justify="flex-start">
        {showAllTab && (
          <Tabs.Tab
            value={ALL_TAB_ID}
            aria-label={t`All dimensions`}
            className={S.allTab}
            px="md"
          >
            <Icon name="grid_2x2" size={16} />
          </Tabs.Tab>
        )}
        {allTabs.map((tab) => (
          <Tabs.Tab key={tab.id} value={tab.id} px="md">
            {tab.label}
            <ActionIcon
              className={S.removeButton}
              size="xs"
              variant="subtle"
              aria-label={t`Remove ${tab.label} tab`}
              onClick={(e) => handleRemoveTab(e, tab.id)}
            >
              <Icon name="close" size={10} />
            </ActionIcon>
          </Tabs.Tab>
        ))}
        {hasAvailableColumns && (
          <AddColumnPopover
            availableColumns={availableColumns}
            sourceOrder={sourceOrder}
            sourceDataById={sourceDataById}
            hasMultipleSources={hasMultipleSources}
            onAddTab={onAddTab}
          />
        )}
      </Tabs.List>
    </Tabs>
  );
}

interface AddColumnPopoverProps {
  availableColumns: ReturnType<typeof selectAvailableColumns>;
  sourceOrder: MetricSourceId[];
  sourceDataById: ReturnType<typeof selectSourceDataById>;
  hasMultipleSources: boolean;
  onAddTab: (columnName: string) => void;
}

type ColumnItem = AvailableColumn & {
  name: string;
};

function AddColumnPopover({
  availableColumns,
  sourceOrder,
  sourceDataById,
  hasMultipleSources,
  onAddTab,
}: AddColumnPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Build sections for AccordionList
  const sections: Section<ColumnItem>[] = useMemo(() => {
    const result: Section<ColumnItem>[] = [];

    // Add "Shared" section if multiple sources and has shared columns
    if (hasMultipleSources && availableColumns.shared.length > 0) {
      result.push({
        name: t`Shared`,
        items: availableColumns.shared.map((col) => ({
          ...col,
          name: col.label,
        })),
      });
    }

    // Add per-source sections
    for (const sourceId of sourceOrder) {
      const sourceColumns = availableColumns.bySource[sourceId];
      if (!sourceColumns || sourceColumns.length === 0) {
        continue;
      }

      if (hasMultipleSources) {
        const sourceName = getSourceDisplayName(sourceId, sourceDataById);
        result.push({
          name: sourceName,
          items: sourceColumns.map((col) => ({
            ...col,
            name: col.label,
          })),
        });
      } else {
        // Single source: flat list without section name
        result.push({
          items: sourceColumns.map((col) => ({
            ...col,
            name: col.label,
          })),
        });
      }
    }

    return result;
  }, [availableColumns, sourceOrder, sourceDataById, hasMultipleSources]);

  const handleSelect = useCallback(
    (item: ColumnItem) => {
      onAddTab(item.columnName);
      setIsOpen(false);
    },
    [onAddTab],
  );

  const renderItemIcon = useCallback(
    (item: ColumnItem) => <Icon name={item.icon} />,
    [],
  );

  return (
    <Popover opened={isOpen} onChange={setIsOpen} position="bottom-start">
      <Popover.Target>
        <ActionIcon
          className={S.addButton}
          aria-label={t`Add dimension tab`}
          onClick={() => setIsOpen(true)}
        >
          <Icon name="add" />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <AccordionList
          className={S.columnPicker}
          sections={sections}
          onChange={handleSelect}
          renderItemIcon={renderItemIcon}
          alwaysExpanded
          globalSearch
          searchable
          maxHeight={300}
          width={280}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
