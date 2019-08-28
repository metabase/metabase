import React, { Component } from "react";

import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";

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
  render() {
    return (
      <Collection.Loader id={this.props.params.collectionId}>
        {({ collection, update }) => (
          <Collection.ModalForm
            collection={collection}
            onSaved={({ id }) => this.props.push(`/collection/${id}`)}
            onClose={this.props.goBack}
          />
        )}
      </Collection.Loader>
    );
  }
}
