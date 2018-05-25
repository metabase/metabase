import React from "react";
import { Flex } from "rebass";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import { t, jt } from "c-3po";

import Icon from "metabase/components/Icon";
import CollectionMoveModal from "metabase/containers/CollectionMoveModal";

import { DashboardApi } from "metabase/services";
import { addUndo, createUndo } from "metabase/redux/undo";

const mapDispatchToProps = {
  addUndo,
  createUndo,
};

@withRouter
@connect(() => ({}), mapDispatchToProps)
class DashboardMoveModal extends React.Component {
  async _moveDashboard(selectedCollection) {
    const { addUndo, createUndo, params } = this.props;

    try {
      await DashboardApi.update({
        id: params.dashboardId,
        collection_id: selectedCollection.id,
      });
      addUndo(
        createUndo({
          type: "dashboard-move-confirm",
          message: () => (
            <Flex align="center">
              <Icon name="all" mr={1} color="white" />
              {jt`Dashboard moved to ${selectedCollection.name}`}
            </Flex>
          ),
        }),
      );
      this.props.onClose();
    } catch (error) {
      this.setState({ error, moving: false });
    }
  }
  render() {
    return (
      <CollectionMoveModal
        title={t`Move dashboard to...`}
        moveFn={this._moveDashboard.bind(this)}
        onClose={this.props.onClose.bind(this)}
      />
    );
  }
}

export default DashboardMoveModal;
