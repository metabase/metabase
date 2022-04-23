/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { getValues } from "redux-form";
import { withRouter } from "react-router";
import { goBack } from "react-router-redux";
import _ from "underscore";

import Collection from "metabase/entities/collections";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";

const { REGULAR_COLLECTION } = PLUGIN_COLLECTIONS;

const FORM_NAME = "create-collection";

const mapStateToProps = (state, props) => {
  const formValues = getValues(state.form[FORM_NAME]);
  return {
    form: Collection.selectors.getForm(state, { ...props, formValues }),
    initialCollectionId: Collection.selectors.getInitialCollectionId(
      state,
      props,
    ),
  };
};

const mapDispatchToProps = {
  goBack,
};

class CollectionCreate extends Component {
  handleClose = () => {
    const { goBack, onClose } = this.props;
    return onClose ? onClose() : goBack();
  };

  handleSaved = collection => {
    const { goBack, onSaved } = this.props;
    return onSaved ? onSaved(collection) : goBack();
  };

  render() {
    const { form, initialCollectionId } = this.props;
    return (
      <Collection.ModalForm
        overwriteOnInitialValuesChange
        formName={FORM_NAME}
        form={form}
        collection={{
          parent_id: initialCollectionId,
          authority_level: REGULAR_COLLECTION.type,
        }}
        onSaved={this.handleSaved}
        onClose={this.handleClose}
      />
    );
  }
}

export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(CollectionCreate);
