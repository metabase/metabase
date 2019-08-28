import React, { Component } from "react";

export default ComposedComponent => {
  class TableMetadataLoader extends Component {
    componentDidMount() {
      const { table } = this.props;
      if (table) {
        table.fetchTableMetadata();
      }
    }

    componentDidUpdate(prevProps) {
      const { table } = this.props;
      if (table !== prevProps.table) {
        table.fetchTableMetadata();
      }
    }

    render() {
      return <ComposedComponent {...this.props} />;
    }
  }

  return TableMetadataLoader;
};
