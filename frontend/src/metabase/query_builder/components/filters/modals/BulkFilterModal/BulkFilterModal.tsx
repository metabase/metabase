import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import StructuredQuery, {
  FilterSection,
} from "metabase-lib/lib/queries/StructuredQuery";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import Button from "metabase/core/components/Button";
import Tab from "metabase/core/components/Tab";
import TabContent from "metabase/core/components/TabContent";
import Icon from "metabase/components/Icon";
import BulkFilterList from "../BulkFilterList";
import {
  ModalCloseButton,
  ModalContent,
  ModalDivider,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalTabList,
  ModalTabPanel,
  ModalTitle,
} from "./BulkFilterModal.styled";

export interface BulkFilterModalProps {
  query: StructuredQuery;
  onClose?: () => void;
}

const BulkFilterModal = ({
  query: initialQuery,
  onClose,
}: BulkFilterModalProps): JSX.Element | null => {
  const [query, setQuery] = useState(initialQuery);
  const [isChanged, setIsChanged] = useState(false);

  const filters = useMemo(() => {
    return query.topLevelFilters();
  }, [query]);

  const sections = useMemo(() => {
    return query.topLevelFilterFieldOptionSections();
  }, [query]);

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

  const handleApplyQuery = useCallback(() => {
    query.update(undefined, { run: true });
    onClose?.();
  }, [query, onClose]);

  return (
    <ModalRoot>
      <ModalHeader>
        <ModalTitle>{getTitle(query)}</ModalTitle>
        <ModalCloseButton onClick={onClose}>
          <Icon name="close" />
        </ModalCloseButton>
      </ModalHeader>
      {sections.length === 1 ? (
        <BulkFilterModalSection
          query={query}
          filters={filters}
          section={sections[0]}
          onAddFilter={handleAddFilter}
          onChangeFilter={handleChangeFilter}
          onRemoveFilter={handleRemoveFilter}
        />
      ) : (
        <BulkFilterModalSectionList
          query={query}
          filters={filters}
          sections={sections}
          onAddFilter={handleAddFilter}
          onChangeFilter={handleChangeFilter}
          onRemoveFilter={handleRemoveFilter}
        />
      )}
      <ModalDivider />
      <ModalFooter>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          primary
          disabled={!isChanged}
          onClick={handleApplyQuery}
        >{t`Apply`}</Button>
      </ModalFooter>
    </ModalRoot>
  );
};

interface BulkFilterModalSectionProps {
  query: StructuredQuery;
  filters: Filter[];
  section: FilterSection;
  onAddFilter: (filter: Filter) => void;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

const BulkFilterModalSection = ({
  query,
  filters,
  section,
  onAddFilter,
  onChangeFilter,
  onRemoveFilter,
}: BulkFilterModalSectionProps): JSX.Element => {
  return (
    <ModalContent>
      <BulkFilterList
        query={query}
        filters={filters}
        options={section.items}
        onAddFilter={onAddFilter}
        onChangeFilter={onChangeFilter}
        onRemoveFilter={onRemoveFilter}
      />
    </ModalContent>
  );
};

interface BulkFilterModalSectionListProps {
  query: StructuredQuery;
  filters: Filter[];
  sections: FilterSection[];
  onAddFilter: (filter: Filter) => void;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

const BulkFilterModalSectionList = ({
  query,
  filters,
  sections,
  onAddFilter,
  onChangeFilter,
  onRemoveFilter,
}: BulkFilterModalSectionListProps): JSX.Element => {
  const [tab, setTab] = useState(0);

  return (
    <TabContent value={tab} onChange={setTab}>
      <ModalTabList>
        {sections.map((section, index) => (
          <Tab
            key={index}
            value={index}
            icon={index > 0 ? section.icon : undefined}
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
          />
        </ModalTabPanel>
      ))}
    </TabContent>
  );
};

const getTitle = (query: StructuredQuery) => {
  const question = query.question();
  return question.isSaved() ? t`Filter ${question.displayName()}` : t`Filter`;
};

export default BulkFilterModal;
