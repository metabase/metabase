import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { Button, Flex, Modal, Tabs } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import {
  getColumnGroupIcon,
  getColumnGroupName,
} from "metabase/common/utils/column-groups";

import * as Lib from "metabase-lib";

import { ColumnFilterSection } from "./ColumnFilterSection";
import {
  ColumnFilterListItem,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ScrollableTabPanel,
} from "./FilterModal.styled";

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

export function FilterModal({
  query: initialQuery,
  opened,
  onSubmit,
  onClose,
}: BulkFilterModalProps) {
  const [query] = useState(initialQuery);

  const columnGroups: ColumnGroupListItem[] = useMemo(() => {
    const stageCount = Lib.stageCount(query);
    const lastStageIndex = stageCount - 1;
    const hasPreviousStage = stageCount > 1;

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
  }, [query]);

  const handleSubmit = useCallback(() => {
    onSubmit(query);
    onClose();
  }, [query, onSubmit, onClose]);

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
                />
              ))}
            </Flex>
          </Tabs>
        </ModalBody>
        <ModalFooter justify="flex-end">
          <Button
            variant="filled"
            disabled
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
}

function FilterableColumnGroup({
  query,
  group: item,
}: FilterableColumnGroupProps) {
  const groupColumns = Lib.getColumnsFromColumnGroup(item.group);
  const value = item.displayInfo.name || COMPUTED_COLUMN_GROUP_ID;
  return (
    <ScrollableTabPanel key={value} value={value}>
      <ul>
        {groupColumns.map((column, i) => (
          <ColumnFilterListItem key={`col-${i}`} pr="md">
            <ColumnFilterSection
              query={query}
              stageIndex={item.stageIndex}
              column={column}
            />
          </ColumnFilterListItem>
        ))}
      </ul>
    </ScrollableTabPanel>
  );
}
