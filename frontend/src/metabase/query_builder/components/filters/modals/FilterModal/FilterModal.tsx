import React from "react";
import { t } from "ttag";
import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Icon from "metabase/components/Icon";
import {
  ModalCloseButton,
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
  const title = getTitle(question);
  const query = question.query();

  if (!(query instanceof StructuredQuery)) {
    return null;
  }

  return (
    <div>
      <ModalHeader>
        <ModalHeaderTitle>{title}</ModalHeaderTitle>
        <ModalCloseButton onClick={onClose}>
          <Icon name="close" />
        </ModalCloseButton>
      </ModalHeader>
    </div>
  );
};

const getTitle = (question: Question) => {
  return question.isSaved()
    ? t`Filter ${question.displayName()}`
    : t`Filter data`;
};

export default FilterModal;
