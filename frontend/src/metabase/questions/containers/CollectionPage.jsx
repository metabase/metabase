import React, { Component } from "react";
import { connect } from "react-redux";
import { replace } from "react-router-redux";
import title from "metabase/hoc/Title";

import { loadCollections } from "../collections";

import _ from "underscore";

const mapStateToProps = (state, props) => ({
  collection: _.findWhere(state.collections.collections, {
    slug: props.params.collectionSlug,
  }),
});

const mapDispatchToProps = {
  replace,
  loadCollections,
};

@connect(mapStateToProps, mapDispatchToProps)
@title(({ collection }) => collection && collection.name)
export default class CollectionPage extends Component {
  componentWillMount() {
    this.props.loadCollections();
  }
  render() {
    return <div className="mx4 mt4" />;
  }
}
