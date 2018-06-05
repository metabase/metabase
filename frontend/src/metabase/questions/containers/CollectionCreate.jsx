import React, { Component } from "react";

import { connect } from "react-redux";

import { push } from "react-router-redux";
import CollectionEditorForm from "./CollectionEditorForm.jsx";

import Collections from "metabase/entities/collections";

const mapDispatchToProps = {
  push,
  createCollection: Collections.actions.create,
};

@connect(null, mapDispatchToProps)
export default class CollectionCreate extends Component {
  render() {
    return (
      <CollectionEditorForm
        onSubmit={async values => {
          const created = await this.props.createCollection(values);
          this.props.push(`/collection/${created.payload.result}`);
        }}
        {...this.props}
      />
    );
  }
}
