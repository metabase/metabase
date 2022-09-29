/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import _ from "underscore";

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

class CreateDashboardModal extends Component {
  static propTypes = {
    onSaved: PropTypes.func,
    onClose: PropTypes.func,
  };

  onSaved = dashboard => {
    const { onClose, onChangeLocation } = this.props;
    if (onClose) {
      onClose();
    }

    const url = Urls.dashboard(dashboard, { editMode: true });
    onChangeLocation(url);
  };

  render() {
    const { initialCollectionId, onSaved, onClose } = this.props;
    return (
      <Dashboard.ModalForm
        form={Dashboard.forms.create}
        overwriteOnInitialValuesChange
        dashboard={{ collection_id: initialCollectionId }}
        onClose={onClose}
        onSaved={typeof onSaved === "function" ? onSaved : this.onSaved}
      />
    );
  }
}

export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(CreateDashboardModal);
