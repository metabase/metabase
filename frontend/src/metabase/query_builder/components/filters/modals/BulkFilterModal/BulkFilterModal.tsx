import React, { useMemo, useState } from "react";
import { t } from "ttag";
import StructuredQuery, {
  FilterSection,
} from "metabase-lib/lib/queries/StructuredQuery";
import Button from "metabase/core/components/Button";
import Tab from "metabase/core/components/Tab";
import TabContent from "metabase/core/components/TabContent";
import TabPanel from "metabase/core/components/TabPanel";
import TabList from "metabase/core/components/TabList";
import Icon from "metabase/components/Icon";
import BulkFilterList from "../BulkFilterList";
import {
  ModalCloseButton,
  ModalRow,
  ModalDivider,
  ModalFooter,
  ModalHeader,
  ModalHeaderTitle,
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
        <ModalSection section={sections[0]} />
      ) : (
        <ModalSectionList sections={sections} />
      )}
      <ModalDivider />
      <ModalFooter>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button primary disabled onClick={onClose}>{t`Apply`}</Button>
      </ModalFooter>
    </div>
  );
};

interface ModalSectionProps {
  section: FilterSection;
}

const ModalSection = ({ section }: ModalSectionProps): JSX.Element => {
  return (
    <ModalRow>
      <BulkFilterList options={section.items} />
    </ModalRow>
  );
};

interface ModalSectionListProps {
  sections: FilterSection[];
}

const ModalSectionList = ({ sections }: ModalSectionListProps): JSX.Element => {
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
      <ModalRow>
        {sections.map((section, index) => (
          <TabPanel key={index} value={index}>
            <BulkFilterList options={section.items} />
          </TabPanel>
        ))}
      </ModalRow>
    </TabContent>
  );
};

const getTitle = (query: StructuredQuery) => {
  const question = query.question();
  return question.isSaved() ? t`Filter ${question.displayName()}` : t`Filter`;
};

export default BulkFilterModal;
