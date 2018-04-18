import React from "react";
import { CollectionsApi } from "metabase/services";

class CollectionItemsLoader extends React.Component {
  state = {
    cards: [],
    dashboards: [],
    pulses: [],
    loading: false,
    error: null,
  };

  componentWillMount() {
    const { params } = this.props;
    let collectionId = 2;
    this._loadCollectionItems(collectionId);
  }

  async _loadCollectionItems(collectionId = 2) {
    try {
      this.setState({ loading: true });
      const { cards, dashboards, pulses } = await CollectionsApi.get({
        id: collectionId,
      });

      this.setState({
        cards,
        dashboards,
        pulses,
        loading: false,
      });
    } catch (error) {
      this.setState({
        loading: false,
        error,
      });
    }
  }

  render() {
    const { cards, dashboards, pulses, loading, error } = this.state;
    return this.props.children({
      cards,
      dashboards,
      pulses,
      loading,
      error,
    });
  }
}

export default CollectionItemsLoader;
