import { type JSX, useCallback } from "react";
import { t } from "ttag";

import { skipToken, useGetCardQuery } from "metabase/api";
import {
  QuestionPickerModal,
  type QuestionPickerValueItem,
  getQuestionPickerValue,
} from "metabase/common/components/Pickers/QuestionPicker";
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
  const { data: card } = useGetCardQuery(
    sourceConfig.card_id != null ? { id: sourceConfig.card_id } : skipToken,
  );

  const initialValue =
    card && getQuestionPickerValue({ id: card.id, type: card.type });

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
