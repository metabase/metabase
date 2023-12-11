import { useMemo, useState } from "react";
import { t } from "ttag";
import { Button, Flex, Modal, Stack, Tabs, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import * as Lib from "metabase-lib";
import { ColumnFilterSection } from "./ColumnFilterSection";
import { FilterSearchInput } from "./FilterSearchInput";
import { SEARCH_KEY } from "./constants";
import {
  appendStageIfAggregated,
  dropStageIfEmpty,
  findColumnFilters,
  findVisibleFilters,
  getGroupItems,
  getModalTitle,
  getModalWidth,
  hasFilters,
  isSearchActive,
  removeFilters,
  searchGroupItems,
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
  const groupItems = useMemo(() => getGroupItems(query), [query]);
  const [tab, setTab] = useState<string | null>(groupItems[0]?.key);
  const canRemoveFilters = useMemo(() => hasFilters(query), [query]);
  const [searchText, setSearchText] = useState("");
  const isSearching = isSearchActive(searchText);

  const visibleItems = useMemo(
    () => (isSearching ? searchGroupItems(groupItems, searchText) : groupItems),
    [groupItems, searchText, isSearching],
  );

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

  const handleSearch = (searchText: string) => {
    setTab(isSearchActive(searchText) ? SEARCH_KEY : groupItems[0]?.key);
    setSearchText(searchText);
  };

  return (
    <Modal.Root opened size={getModalWidth(groupItems)} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <ModalHeader p="lg">
          <Modal.Title>{getModalTitle(groupItems)}</Modal.Title>
          <FilterSearchInput onChange={handleSearch} />
          <Modal.CloseButton />
        </ModalHeader>
        <ModalBody p={0}>
          {visibleItems.length > 0 ? (
            <TabContent
              query={query}
              groupItems={visibleItems}
              tab={tab}
              version={version}
              isSearching={isSearching}
              onChange={handleChange}
              onTabChange={setTab}
            />
          ) : (
            <SearchEmptyState />
          )}
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

interface TabContentProps {
  query: Lib.Query;
  groupItems: GroupItem[];
  tab: string | null;
  version: number;
  isSearching: boolean;
  onChange: (query: Lib.Query) => void;
  onTabChange: (tab: string | null) => void;
}

function TabContent({
  query,
  groupItems,
  tab,
  version,
  isSearching,
  onChange,
  onTabChange,
}: TabContentProps) {
  return (
    <Tabs value={tab} onTabChange={onTabChange} orientation="vertical" h="100%">
      <Flex direction="row" w="100%">
        {groupItems.length > 1 && <TabList groupItems={groupItems} />}
        {groupItems.map(groupItem => (
          <TabPanel
            key={`${groupItem.key}:${version}`}
            query={query}
            groupItem={groupItem}
            isSearching={isSearching}
            onChange={onChange}
          />
        ))}
      </Flex>
    </Tabs>
  );
}

function SearchEmptyState() {
  return (
    <Stack c="text.0" h="100%" justify="center" align="center">
      <Icon name="search" size={40} />
      <Text c="text.1" mt="lg" fw="bold">{t`Didn't find anything`}</Text>
    </Stack>
  );
}

interface TabListProps {
  groupItems: GroupItem[];
}

function TabList({ groupItems }: TabListProps) {
  return (
    <Tabs.List w="20%" pt="sm" pl="md">
      {groupItems.map(groupItem => (
        <Tabs.Tab
          key={groupItem.key}
          value={groupItem.key}
          aria-label={groupItem.displayName}
          icon={<Icon name={groupItem.icon} />}
        >
          {groupItem.displayName}
        </Tabs.Tab>
      ))}
    </Tabs.List>
  );
}

interface TabPanelProps {
  query: Lib.Query;
  groupItem: GroupItem;
  isSearching: boolean;
  onChange: (newQuery: Lib.Query) => void;
}

function TabPanel({ query, groupItem, isSearching, onChange }: TabPanelProps) {
  return (
    <TabPanelRoot value={groupItem.key}>
      <ul>
        {groupItem.columnItems.map((columnItem, columnIndex) => {
          return (
            <TabPanelColumnItemList
              key={columnIndex}
              query={query}
              column={columnItem.column}
              stageIndex={columnItem.stageIndex}
              isSearching={isSearching}
              onChange={onChange}
            />
          );
        })}
      </ul>
    </TabPanelRoot>
  );
}

interface TabPanelColumnItemListProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  isSearching: boolean;
  onChange: (newQuery: Lib.Query) => void;
}

function TabPanelColumnItemList({
  query,
  stageIndex,
  column,
  isSearching,
  onChange,
}: TabPanelColumnItemListProps) {
  const currentFilters = findColumnFilters(query, stageIndex, column);
  const [initialFilterCount] = useState(currentFilters.length);
  const visibleFilters = findVisibleFilters(currentFilters, initialFilterCount);

  return (
    <div>
      {visibleFilters.map((filter, filterIndex) => (
        <TabPanelColumnItem
          key={filterIndex}
          query={query}
          stageIndex={stageIndex}
          column={column}
          filter={filter}
          isSearching={isSearching}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

interface TabPanelColumnItemProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter: Lib.FilterClause | undefined;
  isSearching: boolean;
  onChange: (newQuery: Lib.Query) => void;
}

function TabPanelColumnItem({
  query,
  stageIndex,
  column,
  filter,
  isSearching,
  onChange,
}: TabPanelColumnItemProps) {
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
        isSearching={isSearching}
        onChange={handleChange}
      />
    </ColumnItemRoot>
  );
}
