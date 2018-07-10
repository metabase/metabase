import React, { Component } from "react";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";

import CollectionForm from "metabase/containers/CollectionForm";

@connect(null, { goBack })
export default class CollectionCreate extends Component {
  render() {
    const { params } = this.props;
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
        onSaved={() => this.props.goBack()}
        onClose={this.props.goBack}
      />
    );
  }
}
