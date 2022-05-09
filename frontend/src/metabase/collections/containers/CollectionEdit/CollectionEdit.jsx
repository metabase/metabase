/* eslint-disable react/prop-types */
import React, { Component } from "react";

import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";

import * as Urls from "metabase/lib/urls";
import Collection from "metabase/entities/collections";

import CollectionEditForm from "./CollectionEditForm";

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
          <CollectionEditForm
            collection={collection}
            onSave={this.onSave}
            onClose={this.props.goBack}
          />
        )}
      </Collection.Loader>
    );
  }
}

export default connect(null, mapDispatchToProps)(CollectionEdit);
