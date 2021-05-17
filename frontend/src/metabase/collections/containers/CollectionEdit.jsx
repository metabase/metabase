/* eslint-disable react/prop-types */
import React, { Component } from "react";

import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";

import * as Urls from "metabase/lib/urls";
import Collection from "metabase/entities/collections";

const mapDispatchToProps = {
  push,
  goBack,
};

@connect(
  null,
  mapDispatchToProps,
)
export default class CollectionEdit extends Component {
  onSave = updatedCollection => {
    const url = Urls.collection(updatedCollection);
    this.props.push(url);
  };

  render() {
    const collectionId = Urls.extractCollectionId(this.props.params.slug);
    return (
      <Collection.Loader id={collectionId}>
        {({ collection, update }) => (
          <Collection.ModalForm
            collection={collection}
            onSaved={this.onSave}
            onClose={this.props.goBack}
          />
        )}
      </Collection.Loader>
    );
  }
}
