import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/core/components/Button/Button";
import ModalContent from "metabase/components/ModalContent";
import Questions from "metabase/entities/questions";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, CardId } from "metabase-types/api";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";

interface ParameterFieldStepModalProps {
  cardId: CardId;
  card: Card;
  question: Question;
  onSubmit: (cardId: CardId) => void;
  onClose?: () => void;
}

const ParameterFieldStepModal = ({
  question,
  onSubmit,
  onClose,
}: ParameterFieldStepModalProps): JSX.Element => {
  return (
    <ModalContent
      title={t`Which column from ${question.displayName()} should be used`}
      footer={[
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button key="submit" primary>{t`Done`}</Button>,
      ]}
      onClose={onClose}
    >
      <div />
    </ModalContent>
  );
};

const mapStateToProps = (
  state: State,
  { card }: ParameterFieldStepModalProps,
) => ({
  question: new Question(card, getMetadata(state)),
});

export default _.compose(
  Questions.load({
    id: (state: State, props: ParameterFieldStepModalProps) => props.cardId,
    entityAlias: "card",
  }),
  connect(mapStateToProps),
)(ParameterFieldStepModal);
