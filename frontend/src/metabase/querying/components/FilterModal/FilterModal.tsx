import { useMemo, useState } from "react";
import { t } from "ttag";
import { Button, Flex, Modal, Tabs } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import {
  getColumnGroupIcon,
  getColumnGroupName,
} from "metabase/common/utils/column-groups";
import * as Lib from "metabase-lib";
import { ColumnFilterSection } from "./ColumnFilterSection";
import { getColumnGroupItems, getModalTitle, getModalWidth } from "./utils";
import type { GroupItem } from "./types";
import {
  ColumnItemRoot,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TabPanelRoot,
} from "./FilterModal.styled";

interface FilterModalProps {
  query: Lib.Query;
  opened: boolean;
  onSubmit: (nextQuery: Lib.Query) => void;
  onClose: () => void;
}

export function FilterModal({
  query: initialQuery,
  opened,
  onClose,
}: FilterModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const groupItems = useMemo(() => getColumnGroupItems(query), [query]);

  return (
    <Modal.Root
      opened={opened}
      size={getModalWidth(groupItems)}
      onClose={onClose}
    >
      <Modal.Overlay />
      <Modal.Content>
        <ModalHeader p="lg">
          <Modal.Title>{getModalTitle(groupItems)}</Modal.Title>
          <Modal.CloseButton />
        </ModalHeader>
        <ModalBody p={0}>
          <Tabs
            defaultValue={groupItems[0].key}
            orientation="vertical"
            h="100%"
          >
            <Flex direction="row" w="100%">
              {groupItems.length > 1 && <TabList groupItems={groupItems} />}
              {groupItems.map(groupItem => (
                <TabPanel
                  key={groupItem.key}
                  query={query}
                  groupItem={groupItem}
                  onChange={setQuery}
                />
              ))}
            </Flex>
          </Tabs>
        </ModalBody>
        <ModalFooter p="md" direction="row" justify="space-between">
          <Button
            variant="subtle"
            color="text.1"
          >{t`Clear all filters`}</Button>
          <Button variant="filled">{t`Apply filters`}</Button>
        </ModalFooter>
      </Modal.Content>
    </Modal.Root>
  );
}

interface TabListProps {
  groupItems: GroupItem[];
}

function TabList({ groupItems }: TabListProps) {
  return (
    <Tabs.List w="20%" pt="sm" pl="md">
      {groupItems.map(groupItem => (
        <Tab key={groupItem.key} groupItem={groupItem} />
      ))}
    </Tabs.List>
  );
}

interface TabProps {
  groupItem: GroupItem;
}

function Tab({ groupItem }: TabProps) {
  const { groupInfo } = groupItem;
  const groupName = getColumnGroupName(groupInfo) || t`Summaries`;
  const groupIcon = getColumnGroupIcon(groupInfo) ?? "sum";

  return (
    <Tabs.Tab
      value={groupItem.key}
      aria-label={groupName}
      icon={<Icon name={groupIcon} />}
    >
      {groupName}
    </Tabs.Tab>
  );
}

interface TabPanelProps {
  query: Lib.Query;
  groupItem: GroupItem;
  onChange: (nextQuery: Lib.Query) => void;
}

function TabPanel({ query, groupItem, onChange }: TabPanelProps) {
  return (
    <TabPanelRoot value={groupItem.key}>
      <ul>
        {groupItem.columns.map((column, index) => {
          return (
            <TabPanelItem
              key={index}
              query={query}
              stageIndex={groupItem.stageIndex}
              column={column}
              onChange={onChange}
            />
          );
        })}
      </ul>
    </TabPanelRoot>
  );
}

interface TabPanelItemProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (nextQuery: Lib.Query) => void;
}

function TabPanelItem({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: TabPanelItemProps) {
  const handleFilterChange = (newFilter: Lib.ExpressionClause | null) => {
    if (filter && newFilter) {
      onChange(Lib.replaceClause(query, stageIndex, filter, newFilter));
    } else if (newFilter) {
      onChange(Lib.filter(query, stageIndex, newFilter));
    } else if (filter) {
      onChange(Lib.removeClause(query, stageIndex, filter));
    }
  };

  return (
    <ColumnItemRoot component="li" px="2rem" py="1rem">
      <ColumnFilterSection
        query={query}
        stageIndex={stageIndex}
        column={column}
        filter={filter}
        onChange={handleFilterChange}
      />
    </ColumnItemRoot>
  );
}
