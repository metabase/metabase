import React, { Component } from "react";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";

import CollectionForm from "metabase/containers/CollectionForm";

@connect(null, { goBack })
export default class CollectionCreate extends Component {
  render() {
    const { params } = this.props;
    const collectionId =
      params && params.collectionId != null && params.collectionId !== "root"
        ? parseInt(params.collectionId)
        : null;
    return (
      <CollectionForm
        collection={{
          parent_id: collectionId,
        }}
        onSaved={() => this.props.goBack()}
        onClose={this.props.goBack}
      />
    );
  }
}
