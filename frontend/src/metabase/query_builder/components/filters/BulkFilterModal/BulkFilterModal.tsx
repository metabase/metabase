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
} from "./BulkFilterModal.styled";

interface BulkFilterModalProps {
  query: Lib.Query;
  opened: boolean;
  onSubmit: (nextQuery: Lib.Query) => void;
  onClose: () => void;
}

const STAGE_INDEX = -1;

// Computed column groups have an empty `name`,
// tab navigation components don't accept an empty `value` prop.
const COMPUTED_COLUMN_GROUP_ID = "COMPUTED";

export function BulkFilterModal({
  query: initialQuery,
  opened,
  onSubmit,
  onClose,
}: BulkFilterModalProps) {
  const [query] = useState(initialQuery);

  const columnGroups = useMemo(() => {
    const columns = Lib.filterableColumns(query, STAGE_INDEX);
    return Lib.groupColumns(columns);
  }, [query]);

  const defaultGroupInfo = useMemo(() => {
    const [firstGroup] = columnGroups;
    return Lib.displayInfo(query, STAGE_INDEX, firstGroup);
  }, [query, columnGroups]);

  const handleSubmit = useCallback(() => {
    onSubmit(query);
    onClose();
  }, [query, onSubmit, onClose]);

  const hasNavigation = columnGroups.length > 1;

  const unsafeModalWidth = hasNavigation ? "70rem" : "55rem";
  const modalWidth = `min(98vw, ${unsafeModalWidth})`;

  const modalTitle =
    columnGroups.length === 1
      ? t`Filter ${defaultGroupInfo.displayName} by`
      : t`Filter by`;

  const initialTab = defaultGroupInfo.name || COMPUTED_COLUMN_GROUP_ID;

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
              {hasNavigation && (
                <ColumnGroupNavigation query={query} groups={columnGroups} />
              )}
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
  query: Lib.Query;
  groups: Lib.ColumnGroup[];
}

function ColumnGroupNavigation({ query, groups }: ColumnGroupNavigationProps) {
  return (
    <Tabs.List w="20%" pt="sm" pl="md">
      {groups.map(group => {
        const groupInfo = Lib.displayInfo(query, STAGE_INDEX, group);
        const groupName = getColumnGroupName(groupInfo);
        const groupIcon = getColumnGroupIcon(groupInfo);
        const value = groupInfo.name || COMPUTED_COLUMN_GROUP_ID;
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
  group: Lib.ColumnGroup;
}

function FilterableColumnGroup({ query, group }: FilterableColumnGroupProps) {
  const groupInfo = Lib.displayInfo(query, STAGE_INDEX, group);
  const groupColumns = Lib.getColumnsFromColumnGroup(group);
  const value = groupInfo.name || COMPUTED_COLUMN_GROUP_ID;
  return (
    <ScrollableTabPanel key={value} value={value}>
      <ul>
        {groupColumns.map(column => {
          const columnInfo = Lib.displayInfo(query, STAGE_INDEX, column);
          return (
            <ColumnFilterListItem key={columnInfo.name} pr="md">
              <ColumnFilterSection
                query={query}
                stageIndex={STAGE_INDEX}
                column={column}
              />
            </ColumnFilterListItem>
          );
        })}
      </ul>
    </ScrollableTabPanel>
  );
}
