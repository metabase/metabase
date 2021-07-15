/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";

import Collection from "metabase/entities/collections";
import {PLUGIN_COLLECTIONS} from "metabase/plugins"

const {AUTHORITY_LEVEL} = PLUGIN_COLLECTIONS;

const mapStateToProps = (state, props) => ({
  initialCollectionId: Collection.selectors.getInitialCollectionId(
    state,
    props,
  ),
});

const mapDispatchToProps = {
  goBack,
};

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class CollectionCreate extends Component {
  render() {
    const { initialCollectionId, goBack } = this.props;
    return (
      <Collection.ModalForm
        collection={{
          parent_id: initialCollectionId,
          authority_level: AUTHORITY_LEVEL.regular.type,
        }}
        onSaved={goBack}
        onClose={goBack}
      />
    );
  }
}
