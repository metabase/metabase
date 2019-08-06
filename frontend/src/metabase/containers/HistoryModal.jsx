/* @flow */

import React from "react";

import HistoryModal from "metabase/components/HistoryModal";
import Revision from "metabase/entities/revisions";

@Revision.loadList({
  query: (state, props) => ({
    model_type: props.modelType,
    model_id: props.modelId,
  }),
  wrapped: true,
})
export default class HistoryModalContainer extends React.Component {
  render() {
    const { revisions, onClose, onReverted } = this.props;
    return (
      <HistoryModal
        revisions={revisions}
        onRevert={async revision => {
          await revision.revert();
          if (onReverted) {
            onReverted();
          }
        }}
        onClose={onClose}
      />
    );
  }
}
