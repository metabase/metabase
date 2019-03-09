/* @flow */

import React from "react";

import HistoryModal from "metabase/containers/HistoryModal";

const QuestionHistoryModal = ({ questionId, onClose, onReverted }) => (
  <HistoryModal
    modelType={"card"}
    modelId={questionId}
    onClose={onClose}
    onReverted={onReverted}
  />
);

export default QuestionHistoryModal;
