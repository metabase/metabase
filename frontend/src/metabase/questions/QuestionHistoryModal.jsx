import React from "react"
// TODO - modal route should pass this instead
import { withRouter } from "react-router"

import HistoryModal from "metabase/components/HistoryModal";

@withRouter
class QuestionHistoryModal extends React.Component {

  render () {
    const { params, onClose } = this.props
    return (
      <HistoryModal
        entityType="card"
        entityId={params.cardId}
        onClose={onClose}
      />
    )
  }
}

export default QuestionHistoryModal

