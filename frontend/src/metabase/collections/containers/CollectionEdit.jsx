/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { getValues } from "redux-form";

import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";

import * as Urls from "metabase/lib/urls";
import Collection from "metabase/entities/collections";

const FORM_NAME = "edit-collection";

function mapStateToProps(state, props) {
  const formValues = getValues(state.form[FORM_NAME]);
  return {
    form: Collection.selectors.getForm(state, { ...props, formValues }),
  };
}

function Form({ collection, form, onSave, onClose }) {
  return (
    <Collection.ModalForm
      formName={FORM_NAME}
      form={form}
      collection={collection}
      onSaved={onSave}
      onClose={onClose}
    />
  );
}

const CollectionForm = connect(mapStateToProps)(Form);

const mapDispatchToProps = {
  push,
  goBack,
};

class CollectionEdit extends Component {
  onSave = updatedCollection => {
    const url = Urls.collection(updatedCollection);
    this.props.push(url);
  };

  render() {
    const collectionId = Urls.extractCollectionId(this.props.params.slug);
    return (
      <Collection.Loader id={collectionId}>
        {({ collection, update }) => (
          <CollectionForm
            collection={collection}
            onSave={this.onSave}
            onClose={this.props.goBack}
          />
        )}
      </Collection.Loader>
    );
  }
}

export default connect(
  null,
  mapDispatchToProps,
)(CollectionEdit);
