import React, { Component } from "react";

import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";

import CollectionForm from "metabase/containers/CollectionForm.jsx";
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
          <CollectionForm
            collection={object}
            onSaved={({ id }) => {
              this.props.push(`/collection/${id}`);
            }}
            onClose={this.props.goBack}
          />
        )}
      </CollectionLoader>
    );
  }
}
