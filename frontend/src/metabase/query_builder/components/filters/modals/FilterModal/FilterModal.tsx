import React from "react";
import { t } from "ttag";
import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Button from "metabase/core/components/Button";
import Tab from "metabase/core/components/Tab";
import TabContent from "metabase/core/components/TabContent";
import Icon from "metabase/components/Icon";
import {
  ModalCloseButton,
  ModalDivider,
  ModalFooter,
  ModalHeader,
  ModalHeaderTitle,
  ModalTabList,
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
    <TabContent>
      <ModalHeader>
        <ModalHeaderTitle>{title}</ModalHeaderTitle>
        <ModalCloseButton onClick={onClose}>
          <Icon name="close" />
        </ModalCloseButton>
      </ModalHeader>
      <ModalTabList>
        {sections.map((section, index) => (
          <Tab key={index}>{section.name}</Tab>
        ))}
      </ModalTabList>
      <ModalDivider />
      <ModalFooter>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button primary onClick={onClose}>{t`Apply`}</Button>
      </ModalFooter>
    </TabContent>
  );
};

const getTitle = (question: Question) => {
  return question.isSaved() ? t`Filter ${question.displayName()}` : t`Filter`;
};

export default FilterModal;
