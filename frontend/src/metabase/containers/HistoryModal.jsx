/* eslint-disable react/prop-types */
import React from "react";
import PropTypes from "prop-types";

import HistoryModal from "metabase/components/HistoryModal";
import Revision from "metabase/entities/revisions";

class HistoryModalContainer extends React.Component {
  static propTypes = {
    canRevert: PropTypes.bool.isRequired,
  };

  onRevert = async revision => {
    const { onReverted, reload } = this.props;
    await revision.revert();
    if (onReverted) {
      onReverted();
    }
    await reload();
  };

  render() {
    const { revisions, canRevert, onClose } = this.props;
    return (
      <HistoryModal
        revisions={revisions}
        onRevert={canRevert ? this.onRevert : null}
        onClose={onClose}
      />
    );
  }
}

export default Revision.loadList({
  query: (state, props) => ({
    model_type: props.modelType,
    model_id: props.modelId,
  }),
  wrapped: true,
})(HistoryModalContainer);
