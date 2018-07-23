import React, { Component } from "react";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";

import CollectionForm from "metabase/containers/CollectionForm";
import Collections from "metabase/entities/collections";

const mapStateToProps = (state, props) => ({
  initialCollectionId: Collections.selectors.getInitialCollectionId(
    state,
    props,
  ),
});

const mapDispatchToProps = {
  goBack,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class CollectionCreate extends Component {
  render() {
    const { initialCollectionId, goBack } = this.props;
    return (
      <CollectionForm
        collection={{
          parent_id: initialCollectionId,
        }}
        onSaved={goBack}
        onClose={goBack}
      />
    );
  }
}
