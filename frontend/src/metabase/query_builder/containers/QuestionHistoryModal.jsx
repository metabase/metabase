/* @flow */

import React from "react";

import HistoryModal from "metabase/containers/HistoryModal";

type Props = {
  questionId: number,
  onClose: () => void,
  onReverted: () => void,
};

const QuestionHistoryModal = ({ questionId, onClose, onReverted }: Props) => (
  <HistoryModal
    modelType={"card"}
    modelId={questionId}
    onClose={onClose}
    onReverted={onReverted}
  />
);

export default QuestionHistoryModal;
