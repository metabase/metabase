import React, { useState } from "react";
import { t } from "ttag";
import Question from "metabase-lib/lib/Question";
import StructuredQuery, {
  FilterSection,
} from "metabase-lib/lib/queries/StructuredQuery";
import Button from "metabase/core/components/Button";
import Tab from "metabase/core/components/Tab";
import TabContent from "metabase/core/components/TabContent";
import TabPanel from "metabase/core/components/TabPanel";
import TabList from "metabase/core/components/TabList";
import Icon from "metabase/components/Icon";
import {
  ModalCloseButton,
  ModalContent,
  ModalDivider,
  ModalFooter,
  ModalHeader,
  ModalHeaderTitle,
} from "./FilterModal.styled";

export interface FilterModalProps {
  question: Question;
  onClose?: () => void;
}

const FilterModal = ({
  question,
  onClose,
}: FilterModalProps): JSX.Element | null => {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return null;
  }

  const title = getTitle(question);
  const sections = query.topLevelFilterFieldOptionSections();

  return (
    <div>
      <ModalHeader>
        <ModalHeaderTitle>{title}</ModalHeaderTitle>
        <ModalCloseButton onClick={onClose}>
          <Icon name="close" />
        </ModalCloseButton>
      </ModalHeader>
      <ModalTabContent sections={sections} />
      <ModalDivider />
      <ModalFooter>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button primary disabled onClick={onClose}>{t`Apply`}</Button>
      </ModalFooter>
    </div>
  );
};

interface ModalTabContentProps {
  sections: FilterSection[];
}

const ModalTabContent = ({ sections }: ModalTabContentProps): JSX.Element => {
  const [tab, setTab] = useState(0);

  return (
    <TabContent value={tab} onChange={setTab}>
      <ModalContent>
        <TabList>
          {sections.map((section, index) => (
            <Tab key={index} value={index}>
              {section.name}
            </Tab>
          ))}
        </TabList>
      </ModalContent>
      <ModalDivider />
      {sections.map((section, index) => (
        <TabPanel key={index} value={index} />
      ))}
    </TabContent>
  );
};

const getTitle = (question: Question) => {
  return question.isSaved() ? t`Filter ${question.displayName()}` : t`Filter`;
};

export default FilterModal;
