import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { push } from "react-router-redux";

import * as Urls from "metabase/lib/urls";

import Collection from "metabase/entities/collections";
import Dashboard from "metabase/entities/dashboards";

const mapStateToProps = (state, props) => ({
  initialCollectionId: Collection.selectors.getInitialCollectionId(
    state,
    props,
  ),
});

const mapDispatchToProps = {
  onChangeLocation: push,
};

@withRouter
@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class CreateDashboardModal extends Component {
  static propTypes = {
    onClose: PropTypes.func,
  };

  render() {
    const { initialCollectionId, onClose, onChangeLocation } = this.props;
    return (
      <Dashboard.ModalForm
        dashboard={{ collection_id: initialCollectionId }}
        onClose={onClose}
        onSaved={dashboard => {
          onChangeLocation(Urls.dashboard(dashboard.id));
          if (onClose) {
            onClose();
          }
        }}
      />
    );
  }
}
