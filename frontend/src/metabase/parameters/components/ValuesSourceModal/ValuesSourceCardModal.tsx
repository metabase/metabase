import { useCallback } from "react";
import { t } from "ttag";

import type { QuestionPickerValueItem } from "metabase/common/components/QuestionPicker";
import {
  getQuestionPickerValue,
  QuestionPickerModal,
} from "metabase/common/components/QuestionPicker";
import { useQuestionQuery } from "metabase/common/hooks";
import type { Parameter, ValuesSourceConfig } from "metabase-types/api";

interface ValuesSourceCardModalProps {
  parameter: Parameter;
  sourceConfig: ValuesSourceConfig;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const ValuesSourceCardModal = ({
  parameter,
  sourceConfig,
  onChangeSourceConfig,
  onSubmit,
  onClose,
}: ValuesSourceCardModalProps): JSX.Element => {
  const { data: question } = useQuestionQuery({ id: sourceConfig.card_id });

  const initialValue =
    question &&
    getQuestionPickerValue({ id: question.id(), type: question.type() });

  const handleSubmit = useCallback(
    (newQuestion: QuestionPickerValueItem) => {
      onChangeSourceConfig({ card_id: newQuestion.id });
      onSubmit();
    },
    [onChangeSourceConfig, onSubmit],
  );

  return (
    <QuestionPickerModal
      title={t`Selectable values for ${parameter.name}`}
      value={initialValue}
      onChange={handleSubmit}
      onClose={onClose}
    />
  );
};
