import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useDebouncedEffect } from "metabase/hooks/use-debounced-effect";
import { useOnMount } from "metabase/hooks/use-on-mount";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import StructuredQuery, {
  FilterSection,
  DimensionOption,
  SegmentOption,
} from "metabase-lib/lib/queries/StructuredQuery";
import Question from "metabase-lib/lib/Question";

import Button from "metabase/core/components/Button";
import Tab from "metabase/core/components/Tab";
import TabContent from "metabase/core/components/TabContent";
import Icon from "metabase/components/Icon";
import BulkFilterList from "../BulkFilterList";
import TextInput from "metabase/components/TextInput";
import {
  ModalBody,
  ModalCloseButton,
  ModalDivider,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalTabList,
  ModalTabPanel,
  ModalTitle,
  SearchContainer,
} from "./BulkFilterModal.styled";

import { fixBetweens, getSearchHits } from "./utils";

export interface BulkFilterModalProps {
  question: Question;
  onClose?: () => void;
}

const BulkFilterModal = ({
  question,
  onClose,
}: BulkFilterModalProps): JSX.Element | null => {
  const [query, setQuery] = useState(getQuery(question));
  const [isChanged, setIsChanged] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  useOnMount(() => {
    const searchToggleListener = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        setSearchQuery("");
        setShowSearch(showSearch => !showSearch);
      }
    };
    window.addEventListener("keydown", searchToggleListener);
    return () => window.removeEventListener("keydown", searchToggleListener);
  });

  const filters = useMemo(() => {
    return query.topLevelFilters();
  }, [query]);

  const sections = useMemo(() => {
    return query.topLevelFilterFieldOptionSections(null, 2, true);
  }, [query]);

  const searchItems = useDebouncedEffect(
    () => getSearchHits(searchQuery, sections),
    200,
    [searchQuery, sections],
  );

  const handleAddFilter = useCallback((filter: Filter) => {
    setQuery(filter.add());
    setIsChanged(true);
  }, []);

  const handleChangeFilter = useCallback(
    (filter: Filter, newFilter: Filter) => {
      setQuery(filter.replace(newFilter));
      setIsChanged(true);
    },
    [],
  );

  const handleRemoveFilter = useCallback((filter: Filter) => {
    setQuery(filter.remove());
    setIsChanged(true);
  }, []);

  const handleClearSegments = useCallback(() => {
    setQuery(query.clearSegments());
    setIsChanged(true);
  }, [query]);

  const handleApplyQuery = useCallback(() => {
    const preCleanedQuery = fixBetweens(query);
    preCleanedQuery.clean().update(undefined, { run: true });
    onClose?.();
  }, [query, onClose]);

  const clearFilters = () => {
    setQuery(query.clearFilters());
    setIsChanged(true);
  };

  return (
    <ModalRoot>
      <ModalHeader>
        <ModalTitle>{getTitle(query, sections.length === 1)}</ModalTitle>
        {showSearch ? (
          <FieldSearch value={searchQuery} onChange={setSearchQuery} />
        ) : (
          <ModalCloseButton onClick={onClose}>
            <Icon name="close" />
          </ModalCloseButton>
        )}
      </ModalHeader>
      {sections.length === 1 || searchItems ? (
        <BulkFilterModalSection
          query={query}
          filters={filters}
          items={searchItems ?? sections[0].items}
          isSearch={!!searchItems}
          onAddFilter={handleAddFilter}
          onChangeFilter={handleChangeFilter}
          onRemoveFilter={handleRemoveFilter}
          onClearSegments={handleClearSegments}
        />
      ) : (
        <BulkFilterModalSectionList
          query={query}
          filters={filters}
          sections={sections}
          onAddFilter={handleAddFilter}
          onChangeFilter={handleChangeFilter}
          onRemoveFilter={handleRemoveFilter}
          onClearSegments={handleClearSegments}
        />
      )}
      <ModalDivider />
      <ModalFooter>
        <Button
          onClick={clearFilters}
          borderless
          disabled={!query.hasFilters()}
        >
          {t`Clear all filters`}
        </Button>
        <Button
          primary
          data-testid="apply-filters"
          disabled={!isChanged}
          onClick={handleApplyQuery}
        >{t`Apply Filters`}</Button>
      </ModalFooter>
    </ModalRoot>
  );
};

interface BulkFilterModalSectionProps {
  query: StructuredQuery;
  filters: Filter[];
  items: (DimensionOption | SegmentOption)[];
  isSearch?: boolean;
  onAddFilter: (filter: Filter) => void;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
  onClearSegments: () => void;
}

const BulkFilterModalSection = ({
  query,
  filters,
  items,
  isSearch,
  onAddFilter,
  onChangeFilter,
  onRemoveFilter,
  onClearSegments,
}: BulkFilterModalSectionProps): JSX.Element => {
  return (
    <ModalBody>
      <BulkFilterList
        query={query}
        filters={filters}
        options={items}
        isSearch={isSearch}
        onAddFilter={onAddFilter}
        onChangeFilter={onChangeFilter}
        onRemoveFilter={onRemoveFilter}
        onClearSegments={onClearSegments}
      />
    </ModalBody>
  );
};

interface BulkFilterModalSectionListProps {
  query: StructuredQuery;
  filters: Filter[];
  sections: FilterSection[];
  onAddFilter: (filter: Filter) => void;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
  onClearSegments: () => void;
}

const BulkFilterModalSectionList = ({
  query,
  filters,
  sections,
  onAddFilter,
  onChangeFilter,
  onRemoveFilter,
  onClearSegments,
}: BulkFilterModalSectionListProps): JSX.Element => {
  const [tab, setTab] = useState(0);

  return (
    <TabContent value={tab} onChange={setTab}>
      <ModalTabList>
        {sections.map((section, index) => (
          <Tab key={index} value={index} icon={section.icon}>
            {section.name}
          </Tab>
        ))}
      </ModalTabList>
      <ModalDivider />
      {sections.map((section, index) => (
        <ModalTabPanel key={index} value={index}>
          <BulkFilterList
            query={query}
            filters={filters}
            options={section.items}
            onAddFilter={onAddFilter}
            onChangeFilter={onChangeFilter}
            onRemoveFilter={onRemoveFilter}
            onClearSegments={onClearSegments}
          />
        </ModalTabPanel>
      ))}
    </TabContent>
  );
};

const getQuery = (question: Question) => {
  const query = question.query();

  if (query instanceof StructuredQuery) {
    return query;
  } else {
    throw new Error("Native queries are not supported");
  }
};

const getTitle = (query: StructuredQuery, singleTable: boolean) => {
  const table = query.table();

  if (singleTable) {
    return t`Filter by ${table.displayName()}`;
  } else {
    return t`Filter by`;
  }
};

const FieldSearch = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): JSX.Element => {
  return (
    <SearchContainer>
      <TextInput
        hasClearButton
        placeholder={t`Search for a column...`}
        value={value}
        onChange={onChange}
        padding="sm"
        borderRadius="md"
        autoFocus
        icon={<Icon name="search" size={13} style={{ marginTop: 2 }} />}
      />
    </SearchContainer>
  );
};

export default BulkFilterModal;
