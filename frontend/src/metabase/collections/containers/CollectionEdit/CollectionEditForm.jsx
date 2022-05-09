/* eslint-disable react/prop-types */
import React from "react";

import { connect } from "react-redux";

import Collection from "metabase/entities/collections";

function mapStateToProps(state, props) {
  return {
    form: Collection.selectors.getForm(state, props),
  };
}

function CollectionEditForm({ form, collection, onSave, onClose }) {
  return (
    <Collection.ModalForm
      form={form}
      collection={collection}
      onSaved={onSave}
      onClose={onClose}
    />
  );
}

export default connect(mapStateToProps)(CollectionEditForm);
