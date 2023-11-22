import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { Button, Flex, Modal, Tabs } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import {
  getColumnGroupIcon,
  getColumnGroupName,
} from "metabase/common/utils/column-groups";

import * as Lib from "metabase-lib";

import { findFilterClause } from "./utils";
import { ColumnFilterSection } from "./ColumnFilterSection";
import {
  ColumnFilterListItem,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ScrollableTabPanel,
} from "./BulkFilterModal.styled";

interface BulkFilterModalProps {
  query: Lib.Query;
  opened: boolean;
  onSubmit: (nextQuery: Lib.Query) => void;
  onClose: () => void;
}

interface ColumnGroupListItem {
  group: Lib.ColumnGroup;
  stageIndex: number;
  displayInfo: Lib.ColumnGroupDisplayInfo;
}

// Computed column groups have an empty `name`,
// tab navigation components don't accept an empty `value` prop.
const COMPUTED_COLUMN_GROUP_ID = "COMPUTED";

function toGroupListItem(
  query: Lib.Query,
  stageIndex: number,
  group: Lib.ColumnGroup,
) {
  return {
    group,
    stageIndex,
    displayInfo: Lib.displayInfo(query, stageIndex, group),
  };
}

export function BulkFilterModal({
  query: initialQuery,
  opened,
  onSubmit,
  onClose,
}: BulkFilterModalProps) {
  const [query, setQuery] = useState(initialQuery);

  const stageCount = Lib.stageCount(query);
  const lastStageIndex = stageCount - 1;
  const hasPreviousStage = stageCount > 1;

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const columnGroups: ColumnGroupListItem[] = useMemo(() => {
    const lastStageColumns = Lib.filterableColumns(query, lastStageIndex);
    const previousStageColumns = hasPreviousStage
      ? Lib.filterableColumns(query, lastStageIndex - 1)
      : [];

    const lastStageGroups = Lib.groupColumns(lastStageColumns);
    const previousStageGroups = hasPreviousStage
      ? Lib.groupColumns(previousStageColumns)
      : [];

    return [
      ...previousStageGroups.map(group =>
        toGroupListItem(query, lastStageIndex - 1, group),
      ),
      ...lastStageGroups.map(group =>
        toGroupListItem(query, lastStageIndex, group),
      ),
    ];
  }, [query, lastStageIndex, hasPreviousStage]);

  const hasFilters = useMemo(() => {
    const hasLastStageFilters = Lib.filters(query, lastStageIndex).length > 0;

    if (hasLastStageFilters) {
      return true;
    }
    if (!hasPreviousStage) {
      return false;
    }

    const hasPreviousStageFilters =
      Lib.filters(query, lastStageIndex - 1).length > 0;
    return hasLastStageFilters && hasPreviousStageFilters;
  }, [query, lastStageIndex, hasPreviousStage]);

  const canSubmit = useMemo(
    () => !Lib.areQueriesEqual(initialQuery, query),
    [initialQuery, query],
  );

  const handleSubmit = useCallback(() => {
    onSubmit(query);
    onClose();
  }, [query, onSubmit, onClose]);

  const handleClearAll = useCallback(() => {
    let nextQuery = Lib.clearFilters(query, lastStageIndex);
    nextQuery = hasPreviousStage
      ? Lib.clearFilters(nextQuery, lastStageIndex - 1)
      : nextQuery;
    setQuery(nextQuery);
  }, [query, lastStageIndex, hasPreviousStage]);

  const hasNavigation = columnGroups.length > 1;

  const unsafeModalWidth = hasNavigation ? "70rem" : "55rem";
  const modalWidth = `min(98vw, ${unsafeModalWidth})`;

  const [defaultGroup] = columnGroups;

  const modalTitle =
    columnGroups.length === 1
      ? t`Filter ${defaultGroup.displayInfo.displayName} by`
      : t`Filter by`;

  const initialTab = defaultGroup.displayInfo.name || COMPUTED_COLUMN_GROUP_ID;

  return (
    <Modal.Root opened={opened} size={modalWidth} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <ModalHeader p="lg">
          <Modal.Title>{modalTitle}</Modal.Title>
          <Modal.CloseButton />
        </ModalHeader>
        <ModalBody p={0}>
          <Tabs defaultValue={initialTab} orientation="vertical" h="100%">
            <Flex direction="row" w="100%">
              {hasNavigation && <ColumnGroupNavigation groups={columnGroups} />}
              {columnGroups.map((group, index) => (
                <FilterableColumnGroup
                  key={index}
                  query={query}
                  group={group}
                  onChangeQuery={setQuery}
                />
              ))}
            </Flex>
          </Tabs>
        </ModalBody>
        <ModalFooter justify="space-between">
          <Button
            variant="subtle"
            color="text.1"
            disabled={!hasFilters}
            onClick={handleClearAll}
          >{t`Clear all filters`}</Button>
          <Button
            variant="filled"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >{t`Apply filters`}</Button>
        </ModalFooter>
      </Modal.Content>
    </Modal.Root>
  );
}

interface ColumnGroupNavigationProps {
  groups: ColumnGroupListItem[];
}

function ColumnGroupNavigation({ groups }: ColumnGroupNavigationProps) {
  return (
    <Tabs.List w="20%" pt="sm" pl="md">
      {groups.map(item => {
        const groupName = getColumnGroupName(item.displayInfo) || t`Summaries`;
        const groupIcon = getColumnGroupIcon(item.displayInfo) ?? "sum";
        const value = item.displayInfo.name || COMPUTED_COLUMN_GROUP_ID;
        return (
          <Tabs.Tab
            key={value}
            value={value}
            aria-label={groupName}
            icon={groupIcon && <Icon name={groupIcon} />}
          >
            {groupName}
          </Tabs.Tab>
        );
      })}
    </Tabs.List>
  );
}

interface FilterableColumnGroupProps {
  query: Lib.Query;
  group: ColumnGroupListItem;
  onChangeQuery: (nextQuery: Lib.Query) => void;
}

function FilterableColumnGroup({
  query,
  group: item,
  onChangeQuery,
}: FilterableColumnGroupProps) {
  const { stageIndex } = item;
  const groupColumns = Lib.getColumnsFromColumnGroup(item.group);
  const value = item.displayInfo.name || COMPUTED_COLUMN_GROUP_ID;

  return (
    <ScrollableTabPanel key={value} value={value}>
      <ul>
        {groupColumns.map((column, i) => {
          const filter = findFilterClause(query, stageIndex, column);

          const handleFilterChange = (
            newFilter: Lib.ExpressionClause | undefined,
          ) => {
            if (filter && newFilter) {
              onChangeQuery(
                Lib.replaceClause(query, stageIndex, filter, newFilter),
              );
            } else if (newFilter) {
              onChangeQuery(Lib.filter(query, stageIndex, newFilter));
            } else if (filter) {
              onChangeQuery(Lib.removeClause(query, stageIndex, filter));
            }
          };

          return (
            <ColumnFilterListItem key={`col-${i}`} px="2rem" py="1rem">
              <ColumnFilterSection
                query={query}
                stageIndex={stageIndex}
                column={column}
                filter={filter}
                onChange={handleFilterChange}
              />
            </ColumnFilterListItem>
          );
        })}
      </ul>
    </ScrollableTabPanel>
  );
}
