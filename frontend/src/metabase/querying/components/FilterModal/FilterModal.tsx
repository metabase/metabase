import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  Button,
  Flex,
  Modal,
  Stack,
  Tabs,
  Text,
  Icon,
  DelayGroup,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { ColumnFilterSection } from "./ColumnFilterSection";
import {
  TabPanelItem,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TabPanelRoot,
  TabsListSidebar,
} from "./FilterModal.styled";
import { FilterSearchInput } from "./FilterSearchInput";
import { SegmentFilterEditor } from "./SegmentFilterEditor";
import { SEARCH_KEY } from "./constants";
import type { ColumnItem, GroupItem, SegmentItem } from "./types";
import {
  addSegmentFilters,
  appendStageIfAggregated,
  findColumnFilters,
  findVisibleFilters,
  getGroupItems,
  getModalTitle,
  getModalWidth,
  hasFilters,
  isSearchActive,
  removeFilters,
  removeSegmentFilters,
  searchGroupItems,
  sortColumns,
} from "./utils";

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

  const handleInput = () => {
    if (!isChanged) {
      setIsChanged(true);
    }
  };

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
    onSubmit(Lib.dropEmptyStages(query));
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
          <FilterSearchInput searchText={searchText} onChange={handleSearch} />
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
              onInput={handleInput}
              onTabChange={setTab}
            />
          ) : (
            <SearchEmptyState />
          )}
        </ModalBody>
        <ModalFooter p="md" direction="row" justify="space-between">
          <Button
            variant="subtle"
            color="text-medium"
            disabled={!canRemoveFilters}
            onClick={handleReset}
          >
            {t`Clear all filters`}
          </Button>
          <Button
            variant="filled"
            disabled={!isChanged}
            data-testid="apply-filters"
            onClick={handleSubmit}
          >
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
  onInput: () => void;
  onTabChange: (tab: string | null) => void;
}

function TabContent({
  query,
  groupItems,
  tab,
  version,
  isSearching,
  onChange,
  onInput,
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
            onInput={onInput}
          />
        ))}
      </Flex>
    </Tabs>
  );
}

function SearchEmptyState() {
  return (
    <Stack c="text-light" h="100%" justify="center" align="center">
      <Icon name="search" size={40} />
      <Text c="text-medium" mt="lg" fw="bold">{t`Didn't find anything`}</Text>
    </Stack>
  );
}

interface TabListProps {
  groupItems: GroupItem[];
}

function TabList({ groupItems }: TabListProps) {
  return (
    <TabsListSidebar w="25%" pt="sm" pl="md">
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
    </TabsListSidebar>
  );
}

interface TabPanelProps {
  query: Lib.Query;
  groupItem: GroupItem;
  isSearching: boolean;
  onChange: (newQuery: Lib.Query) => void;
  onInput: () => void;
}

function TabPanel({
  query,
  groupItem,
  isSearching,
  onChange,
  onInput,
}: TabPanelProps) {
  return (
    <TabPanelRoot value={groupItem.key}>
      <ul>
        {groupItem.segmentItems.length > 0 && (
          <TabPanelSegmentItem
            query={query}
            segmentItems={groupItem.segmentItems}
            onChange={onChange}
          />
        )}
        {groupItem.columnItems.length > 0 && (
          <TabPanelColumnItemList
            query={query}
            columnItems={groupItem.columnItems}
            isSearching={isSearching}
            onChange={onChange}
            onInput={onInput}
          />
        )}
      </ul>
    </TabPanelRoot>
  );
}

interface TabPanelColumnItemListProps {
  query: Lib.Query;
  columnItems: ColumnItem[];
  isSearching: boolean;
  onChange: (newQuery: Lib.Query) => void;
  onInput: () => void;
}

const TabPanelColumnItemList = ({
  query,
  columnItems,
  isSearching,
  onChange,
  onInput,
}: TabPanelColumnItemListProps) => {
  const sortedItems = useMemo(() => sortColumns(columnItems), [columnItems]);

  return (
    <>
      {sortedItems.map((columnItem, columnIndex) => (
        <TabPanelColumnItem
          key={columnIndex}
          query={query}
          columnItem={columnItem}
          isSearching={isSearching}
          onChange={onChange}
          onInput={onInput}
        />
      ))}
    </>
  );
};

interface TabPanelColumnItemProps {
  query: Lib.Query;
  columnItem: ColumnItem;
  isSearching: boolean;
  onChange: (newQuery: Lib.Query) => void;
  onInput: () => void;
}

function TabPanelColumnItem({
  query,
  columnItem,
  isSearching,
  onChange,
  onInput,
}: TabPanelColumnItemProps) {
  const { column, stageIndex } = columnItem;
  const currentFilters = useMemo(
    () => findColumnFilters(query, stageIndex, column),
    [query, stageIndex, column],
  );
  const [initialFilterCount] = useState(currentFilters.length);
  const visibleFilters = findVisibleFilters(currentFilters, initialFilterCount);

  return (
    <DelayGroup>
      {visibleFilters.map((filter, filterIndex) => (
        <TabPanelFilterItem
          key={filterIndex}
          query={query}
          columnItem={columnItem}
          filter={filter}
          isSearching={isSearching}
          onChange={onChange}
          onInput={onInput}
        />
      ))}
    </DelayGroup>
  );
}

interface TabPanelFilterItemProps {
  query: Lib.Query;
  columnItem: ColumnItem;
  filter: Lib.FilterClause | undefined;
  isSearching: boolean;
  onChange: (newQuery: Lib.Query) => void;
  onInput: () => void;
}

function TabPanelFilterItem({
  query,
  columnItem,
  filter,
  isSearching,
  onChange,
  onInput,
}: TabPanelFilterItemProps) {
  const { column, displayName, stageIndex } = columnItem;

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
    <TabPanelItem component="li" data-testid={`filter-column-${displayName}`}>
      <ColumnFilterSection
        query={query}
        stageIndex={stageIndex}
        column={column}
        filter={filter}
        isSearching={isSearching}
        onChange={handleChange}
        onInput={onInput}
      />
    </TabPanelItem>
  );
}

interface TabPanelSegmentItemProps {
  query: Lib.Query;
  segmentItems: SegmentItem[];
  onChange: (newQuery: Lib.Query) => void;
}

function TabPanelSegmentItem({
  query,
  segmentItems,
  onChange,
}: TabPanelSegmentItemProps) {
  const handleChange = (newSegmentItems: SegmentItem[]) => {
    const newQuery = removeSegmentFilters(query, segmentItems);
    onChange(addSegmentFilters(newQuery, newSegmentItems));
  };

  return (
    <TabPanelItem
      component="li"
      px="2rem"
      py="1rem"
      data-testid="filter-column-segments"
    >
      <SegmentFilterEditor
        segmentItems={segmentItems}
        onChange={handleChange}
      />
    </TabPanelItem>
  );
}
