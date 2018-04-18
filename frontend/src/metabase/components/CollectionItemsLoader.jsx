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
    this._loadCollectionItems(this.props.collectionId);
  }

  componentWillUpdate(nextProps) {
    if (this.props.collectionId !== nextProps.collectionId) {
      this._loadCollectionItems(nextProps.collectionId);
    }
  }

  async _loadCollectionItems(collectionId) {
    try {
      console.log("Loading collections for ", collectionId);
      this.setState({ loading: true });
      if (collectionId) {
        const { cards, dashboards, pulses } = await CollectionsApi.get({
          id: collectionId,
        });
        this.setState({
          cards,
          dashboards,
          pulses,
          loading: false,
        });
      } else {
        const { cards, dashboards, pulses } = await CollectionsApi.getRoot();
        this.setState({
          cards,
          dashboards,
          pulses,
          loading: false,
        });
      }
    } catch (error) {
      this.setState({
        loading: false,
        error,
      });
    }
  }

  render() {
    const { cards, dashboards, pulses, loading, error } = this.state;
    const unified = cards.concat(dashboards, pulses);
    return this.props.children({
      cards,
      dashboards,
      pulses,
      loading,
      error,
      unified,
    });
  }
}

export default CollectionItemsLoader;
