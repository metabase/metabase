import React, { Component } from "react";

import { connect } from "react-redux";
import { goBack } from "react-router-redux";

import CollectionEditorForm from "./CollectionEditorForm.jsx";

import { saveCollection, loadCollection } from "../collections";

const mapStateToProps = (state, props) => ({
  error: state.collections.error,
  collection: state.collections.collection,
});

const mapDispatchToProps = {
  loadCollection,
  saveCollection,
  onClose: goBack,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class CollectionEdit extends Component {
  componentWillMount() {
    this.props.loadCollection(this.props.params.collectionId);
  }
  render() {
    return (
      <CollectionEditorForm
        {...this.props}
        onSubmit={this.props.saveCollection}
        initialValues={this.props.collection}
      />
    );
  }
}
