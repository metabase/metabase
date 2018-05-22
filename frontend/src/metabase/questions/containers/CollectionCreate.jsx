import React, { Component } from "react";

import { connect } from "react-redux";
import { push } from "react-router-redux";

import CollectionEditorForm from "./CollectionEditorForm.jsx";

import { saveCollection } from "../collections";

const mapStateToProps = (state, props) => ({
  error: state.collections.error,
  collection: state.collections.collection,
});

const mapDispatchToProps = {
  saveCollection,
  onClose: () => push("/questions"),
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
