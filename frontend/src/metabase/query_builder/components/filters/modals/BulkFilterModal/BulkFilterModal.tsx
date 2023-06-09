import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useDebouncedEffect } from "metabase/hooks/use-debounced-effect";

import { pluralize } from "metabase/lib/formatting";

import Button from "metabase/core/components/Button";
import Tab from "metabase/core/components/Tab";
import TabContent from "metabase/core/components/TabContent";
import { Icon, IconName } from "metabase/core/components/Icon";
import Question from "metabase-lib/Question";
import StructuredQuery, {
  FilterSection,
  DimensionOption,
  SegmentOption,
} from "metabase-lib/queries/StructuredQuery";
import Filter from "metabase-lib/queries/structured/Filter";
import BulkFilterList from "../BulkFilterList";
import {
  ModalBody,
  ModalCloseButton,
  ModalDivider,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalMain,
  ModalTabList,
  ModalTabPanel,
  ModalTitle,
} from "./BulkFilterModal.styled";

import { FieldSearch } from "./BulkFilterFieldSearch";

import { fixBetweens, getSearchHits } from "./utils";

export interface BulkFilterModalProps {
  question: Question;
  onQueryChange: (query: StructuredQuery) => void;
  onClose?: () => void;
}

const BulkFilterModal = ({
  question,
  onClose,
  onQueryChange,
}: BulkFilterModalProps): JSX.Element | null => {
  const [query, setQuery] = useState(getQuery(question));
  const [isChanged, setIsChanged] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

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
    setQuery(filter.add().rootQuery());
    setIsChanged(true);
  }, []);

  const handleChangeFilter = useCallback(
    (filter: Filter, newFilter: Filter) => {
      setQuery(filter.replace(newFilter).rootQuery());
      setIsChanged(true);
    },
    [],
  );

  const handleRemoveFilter = useCallback((filter: Filter) => {
    setQuery(filter.remove().rootQuery());
    setIsChanged(true);
  }, []);

  const handleClearSegments = useCallback(() => {
    setQuery(query.clearSegments());
    setIsChanged(true);
  }, [query]);

  const handleApplyQuery = useCallback(() => {
    const preCleanedQuery = fixBetweens(query);
    onQueryChange(preCleanedQuery.clean());
    onClose?.();
  }, [query, onClose, onQueryChange]);

  const clearFilters = () => {
    setQuery(query.clearFilters());
    setIsChanged(true);
  };

  const hasSideNav = sections.length > 1;

  return (
    <ModalRoot hasSideNav={hasSideNav}>
      <ModalHeader>
        <ModalTitle>{getTitle(query, sections.length === 1)}</ModalTitle>

        <FieldSearch value={searchQuery} onChange={setSearchQuery} />

        <ModalCloseButton onClick={onClose}>
          <Icon name="close" />
        </ModalCloseButton>
      </ModalHeader>
      <ModalMain>
        {!hasSideNav || searchItems ? (
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
      </ModalMain>
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
          <Tab
            key={index}
            value={index}
            icon={section.icon as unknown as IconName}
          >
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

  if (singleTable && table) {
    return t`Filter ${pluralize(table.displayName())} by`;
  } else {
    return t`Filter by`;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default BulkFilterModal;
