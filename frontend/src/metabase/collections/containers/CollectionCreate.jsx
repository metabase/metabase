import React, { Component } from "react";
import { connect } from "react-redux";
import { push, goBack } from "react-router-redux";

import CollectionForm from "metabase/containers/CollectionForm";

@connect(null, { push, goBack })
export default class CollectionCreate extends Component {
  render() {
    const { push, params } = this.props;
    const collectionId =
      params && params.collectionId && parseFloat(params.collectionId);
    return (
      <CollectionForm
        collection={
          collectionId != null
            ? {
                parent_id: collectionId,
              }
            : null
        }
        onSaved={({ id }) => push(`/collection/${id}`)}
        onClose={this.props.goBack}
      />
    );
  }
}
