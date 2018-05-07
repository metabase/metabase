import React, { Component } from "react";

import { connect } from "react-redux";

import CollectionEditorForm from "./CollectionEditorForm.jsx";

import { saveCollection } from "../collections";

const mapStateToProps = (state, props) => ({
  error: state.collections.error,
  collection: state.collections.collection,
});

const mapDispatchToProps = {
  saveCollection,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class CollectionEdit extends Component {
  render() {
    return (
      <CollectionEditorForm
        {...this.props}
        onSubmit={this.props.saveCollection}
      />
    );
  }
}
