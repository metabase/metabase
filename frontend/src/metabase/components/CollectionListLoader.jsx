/* @flow */
import React from "react";
import { CollectionsApi } from "metabase/services";

class CollectionListLoader extends React.Component {
  state = {
    collections: null,
    loading: false,
    error: null,
  };

  componentWillMount() {
    this._loadCollections();
  }

  async _loadCollections(collectionId: ?number) {
    try {
      this.setState({ loading: true, error: null });

      const collections = await CollectionsApi.list();

      this.setState({ collections, loading: false });
    } catch (error) {
      this.setState({ loading: false, error });
    }
  }

  render() {
    const { children } = this.props;
    const { collections, loading, error } = this.state;
    return children && children({ collections, loading, error });
  }
}

export default CollectionListLoader;
