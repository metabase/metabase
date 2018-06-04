import React, { Component } from "react";

import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";

import CollectionEditorForm from "./CollectionEditorForm.jsx";
import CollectionLoader from "metabase/containers/CollectionLoader.jsx";

const mapDispatchToProps = {
  push,
  goBack,
};

@connect(null, mapDispatchToProps)
export default class CollectionEdit extends Component {
  render() {
    return (
      <CollectionLoader collectionId={this.props.params.collectionId}>
        {({ object, update }) => (
          <CollectionEditorForm
            initialValues={object}
            onSubmit={async values => {
              await update(values);
              this.props.push(`/collection/${object.id}`);
            }}
            onClose={this.props.goBack}
          />
        )}
      </CollectionLoader>
    );
  }
}
