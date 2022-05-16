import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import StructuredQuery, {
  FilterSection,
} from "metabase-lib/lib/queries/StructuredQuery";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import Button from "metabase/core/components/Button";
import Tab from "metabase/core/components/Tab";
import TabContent from "metabase/core/components/TabContent";
import TabPanel from "metabase/core/components/TabPanel";
import TabList from "metabase/core/components/TabList";
import Icon from "metabase/components/Icon";
import BulkFilterList from "../BulkFilterList";
import {
  ModalCloseButton,
  ModalDivider,
  ModalFooter,
  ModalHeader,
  ModalHeaderTitle,
  ModalRow,
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
    <div>
      <ModalHeader>
        <ModalHeaderTitle>{getTitle(query)}</ModalHeaderTitle>
        <ModalCloseButton onClick={onClose}>
          <Icon name="close" />
        </ModalCloseButton>
      </ModalHeader>
      {sections.length === 1 ? (
        <BulkFilterModalSection
          query={query}
          filters={filters}
          section={sections[0]}
          onChangeFilter={handleChangeFilter}
          onRemoveFilter={handleRemoveFilter}
        />
      ) : (
        <BulkFilterModalSectionList
          query={query}
          filters={filters}
          sections={sections}
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
    </div>
  );
};

interface BulkFilterModalSectionProps {
  query: StructuredQuery;
  filters: Filter[];
  section: FilterSection;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

const BulkFilterModalSection = ({
  query,
  filters,
  section: { items },
  onChangeFilter,
  onRemoveFilter,
}: BulkFilterModalSectionProps): JSX.Element => {
  const dimensions = useMemo(() => items.map(i => i.dimension), [items]);

  return (
    <ModalRow>
      <BulkFilterList
        query={query}
        filters={filters}
        dimensions={dimensions}
        onChangeFilter={onChangeFilter}
        onRemoveFilter={onRemoveFilter}
      />
    </ModalRow>
  );
};

interface BulkFilterModalSectionListProps {
  query: StructuredQuery;
  filters: Filter[];
  sections: FilterSection[];
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

const BulkFilterModalSectionList = ({
  query,
  filters,
  sections,
  onChangeFilter,
  onRemoveFilter,
}: BulkFilterModalSectionListProps): JSX.Element => {
  const [tab, setTab] = useState(0);

  return (
    <TabContent value={tab} onChange={setTab}>
      <ModalRow>
        <TabList>
          {sections.map((section, index) => (
            <Tab
              key={index}
              value={index}
              icon={index > 0 ? section.icon : undefined}
            >
              {section.name}
            </Tab>
          ))}
        </TabList>
      </ModalRow>
      <ModalDivider />
      {sections.map((section, index) => (
        <TabPanel key={index} value={index}>
          <BulkFilterModalSection
            query={query}
            filters={filters}
            section={section}
            onChangeFilter={onChangeFilter}
            onRemoveFilter={onRemoveFilter}
          />
        </TabPanel>
      ))}
    </TabContent>
  );
};

const getTitle = (query: StructuredQuery) => {
  const question = query.question();
  return question.isSaved() ? t`Filter ${question.displayName()}` : t`Filter`;
};

export default BulkFilterModal;
