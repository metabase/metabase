import React from "react";
import { SegmentApi } from "metabase/services";

class SegmentListLoader extends React.Component {
  state = {
    segments: null,

    loading: false,
    error: null,
  };

  componentWillMount() {
    this._loadSegments();
  }

  async _loadSegments() {
    try {
      this.setState({ loading: true, error: null });

      const segments = await SegmentApi.list();

      this.setState({ loading: false, segments });
    } catch (error) {
      this.setState({ loading: false, error });
    }
  }

  // TODO - NYI, eventually segments will live in collections
  _loadSegmentsForCollection(collectionId) {}

  render() {
    const { children } = this.props;
    const { segments, loading, error } = this.state;

    return children && children({ segments, loading, error });
  }
}

export default SegmentListLoader;
