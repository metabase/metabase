import React from "react";
import { t } from "ttag";
import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Button from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";
import FilterEditor from "metabase/query_builder/components/filters/modals/FilterEditor";

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

  return (
    <ModalContent
      title={t`Filter`}
      footer={[
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button key="submit" primary onClick={onClose}>{t`Apply`}</Button>,
      ]}
      onClose={onClose}
    >
      <FilterEditor query={query} />
    </ModalContent>
  );
};

export default FilterModal;
