/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { getValues } from "redux-form";
import { goBack } from "react-router-redux";

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

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class CollectionCreate extends Component {
  render() {
    const { form, initialCollectionId, goBack } = this.props;
    return (
      <Collection.ModalForm
        formName={FORM_NAME}
        form={form}
        collection={{
          parent_id: initialCollectionId,
          authority_level: REGULAR_COLLECTION.type,
        }}
        onSaved={goBack}
        onClose={goBack}
      />
    );
  }
}
