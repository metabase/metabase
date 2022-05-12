import React from "react";
import PropTypes from "prop-types";

import Questions from "metabase/entities/questions";
import HistoryModal from "metabase/containers/HistoryModal";

class QuestionHistoryModalInner extends React.Component {
  static propTypes = {
    question: PropTypes.object.isRequired,
    questionId: PropTypes.number.isRequired,
    onClose: PropTypes.func.isRequired,
    onReverted: PropTypes.func.isRequired,
  };

  render() {
    const { question, onClose, onReverted } = this.props;
    return (
      <HistoryModal
        modelType={"card"}
        modelId={question.id}
        canRevert={question.can_write}
        onClose={onClose}
        onReverted={onReverted}
      />
    );
  }
}

const QuestionHistoryModal = Questions.load({
  id: (state, props) => props.questionId,
})(QuestionHistoryModalInner);

export default QuestionHistoryModal;
