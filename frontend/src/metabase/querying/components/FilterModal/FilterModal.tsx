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
import {
  appendStageIfAggregated,
  dropStageIfEmpty,
  findColumnFilters,
  findVisibleFilters,
  getColumnGroupItems,
  getModalTitle,
  getModalWidth,
  hasFilters,
  removeFilters,
} from "./utils";
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
  onSubmit: (newQuery: Lib.Query) => void;
  onClose: () => void;
}

export function FilterModal({
  query: initialQuery,
  onSubmit,
  onClose,
}: FilterModalProps) {
  const [query, setQuery] = useState(() =>
    appendStageIfAggregated(initialQuery),
  );
  const [version, setVersion] = useState(1);
  const [isChanged, setIsChanged] = useState(false);
  const groupItems = useMemo(() => getColumnGroupItems(query), [query]);
  const canRemoveFilters = useMemo(() => hasFilters(query), [query]);

  const handleChange = (newQuery: Lib.Query) => {
    setQuery(newQuery);
    setIsChanged(true);
  };

  const handleReset = () => {
    setQuery(removeFilters(query));
    setVersion(version + 1);
    setIsChanged(true);
  };

  const handleSubmit = () => {
    onSubmit(dropStageIfEmpty(query));
    onClose();
  };

  return (
    <Modal.Root opened size={getModalWidth(groupItems)} onClose={onClose}>
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
                  key={`${groupItem.key}:${version}`}
                  query={query}
                  groupItem={groupItem}
                  onChange={handleChange}
                />
              ))}
            </Flex>
          </Tabs>
        </ModalBody>
        <ModalFooter p="md" direction="row" justify="space-between">
          <Button
            variant="subtle"
            color="text.1"
            disabled={!canRemoveFilters}
            onClick={handleReset}
          >
            {t`Clear all filters`}
          </Button>
          <Button variant="filled" disabled={!isChanged} onClick={handleSubmit}>
            {t`Apply filters`}
          </Button>
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
  onChange: (newQuery: Lib.Query) => void;
}

function TabPanel({ query, groupItem, onChange }: TabPanelProps) {
  return (
    <TabPanelRoot value={groupItem.key}>
      <ul>
        {groupItem.columns.map((column, index) => {
          return (
            <TabPanelItemList
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

interface TabPanelItemListProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  onChange: (newQuery: Lib.Query) => void;
}

function TabPanelItemList({
  query,
  stageIndex,
  column,
  onChange,
}: TabPanelItemListProps) {
  const currentFilters = findColumnFilters(query, stageIndex, column);
  const [initialFilterCount] = useState(currentFilters.length);
  const visibleFilters = findVisibleFilters(currentFilters, initialFilterCount);

  return (
    <div>
      {visibleFilters.map((filter, filterIndex) => (
        <TabPanelItem
          key={filterIndex}
          query={query}
          stageIndex={stageIndex}
          column={column}
          filter={filter}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

interface TabPanelItemProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (newQuery: Lib.Query) => void;
}

function TabPanelItem({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: TabPanelItemProps) {
  const handleChange = (newFilter: Lib.ExpressionClause | undefined) => {
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
        onChange={handleChange}
      />
    </ColumnItemRoot>
  );
}
