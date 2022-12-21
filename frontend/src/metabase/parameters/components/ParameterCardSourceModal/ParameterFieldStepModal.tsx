import React, { useCallback, useMemo, useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/core/components/Button/Button";
import Select, {
  Option,
  SelectChangeEvent,
} from "metabase/core/components/Select";
import ModalContent from "metabase/components/ModalContent";
import Questions from "metabase/entities/questions";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, CardId, FieldMetadata } from "metabase-types/api";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";

interface ParameterFieldStepModalProps {
  question: Question;
  fieldRef: unknown[] | undefined;
  onSubmit: (fieldRef: unknown[]) => void;
  onCancel: () => void;
  onClose: () => void;
}

const ParameterFieldStepModal = ({
  question,
  fieldRef,
  onSubmit,
  onCancel,
  onClose,
}: ParameterFieldStepModalProps): JSX.Element => {
  const fields = useMemo(() => question.getResultMetadata(), [question]);
  const [field, setField] = useState(() => getSelectedField(fields, fieldRef));

  const handleChange = useCallback(
    (event: SelectChangeEvent<FieldMetadata>) => {
      setField(event.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    if (field) {
      onSubmit(field.field_ref);
    }
  }, [field, onSubmit]);

  return (
    <ModalContent
      title={t`Which column from ${question.displayName()} should be used`}
      footer={[
        <Button key="cancel" onClick={onCancel}>{t`Back`}</Button>,
        <Button
          key="submit"
          primary
          disabled={!field}
          onClick={handleSubmit}
        >{t`Done`}</Button>,
      ]}
      onClose={onClose}
    >
      <Select
        value={field}
        placeholder={t`Pick a column`}
        onChange={handleChange}
      >
        {fields.map((field, index) => (
          <Option key={index} name={field.display_name} value={field} />
        ))}
      </Select>
    </ModalContent>
  );
};

const getSelectedField = (fields: FieldMetadata[], fieldRef?: unknown[]) => {
  return fields.find(field => _.isEqual(field.field_ref, fieldRef));
};

export default _.compose(
  Questions.load({
    id: (state: State, { cardId }: { cardId: CardId }) => cardId,
    entityAlias: "card",
  }),
  connect((state: State, { card }: { card: Card }) => ({
    question: new Question(card, getMetadata(state)),
  })),
)(ParameterFieldStepModal);
