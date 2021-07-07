/* eslint-disable react/prop-types */
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
    onSaved: PropTypes.func,
    onClose: PropTypes.func,
  };

  onSaved = dashboard => {
    const { onClose, onChangeLocation } = this.props;
    onChangeLocation(Urls.dashboard(dashboard));
    if (onClose) {
      onClose();
    }
  };

  render() {
    const { initialCollectionId, onSaved, onClose } = this.props;
    return (
      <Dashboard.ModalForm
        overwriteOnInitialValuesChange
        dashboard={{ collection_id: initialCollectionId }}
        onClose={onClose}
        onSaved={typeof onSaved === "function" ? onSaved : this.onSaved}
      />
    );
  }
}
