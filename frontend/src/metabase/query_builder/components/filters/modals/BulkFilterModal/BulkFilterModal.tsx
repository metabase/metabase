import React, { useMemo, useState } from "react";
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
  query,
  onClose,
}: BulkFilterModalProps): JSX.Element | null => {
  const title = useMemo(() => {
    return getTitle(query);
  }, [query]);

  const filters = useMemo(() => {
    return query.topLevelFilters();
  }, [query]);

  const sections = useMemo(() => {
    return query.topLevelFilterFieldOptionSections();
  }, [query]);

  return (
    <div>
      <ModalHeader>
        <ModalHeaderTitle>{title}</ModalHeaderTitle>
        <ModalCloseButton onClick={onClose}>
          <Icon name="close" />
        </ModalCloseButton>
      </ModalHeader>
      {sections.length === 1 ? (
        <BulkFilterModalSection filters={filters} section={sections[0]} />
      ) : (
        <BulkFilterModalSectionList filters={filters} sections={sections} />
      )}
      <ModalDivider />
      <ModalFooter>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button primary disabled onClick={onClose}>{t`Apply`}</Button>
      </ModalFooter>
    </div>
  );
};

interface BulkFilterModalSectionProps {
  filters: Filter[];
  section: FilterSection;
}

const BulkFilterModalSection = ({
  filters,
  section: { items },
}: BulkFilterModalSectionProps): JSX.Element => {
  const dimensions = useMemo(() => items.map(i => i.dimension), [items]);

  return (
    <ModalRow>
      <BulkFilterList filters={filters} dimensions={dimensions} />
    </ModalRow>
  );
};

interface BulkFilterModalSectionListProps {
  filters: Filter[];
  sections: FilterSection[];
}

const BulkFilterModalSectionList = ({
  filters,
  sections,
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
          <BulkFilterModalSection filters={filters} section={section} />
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
