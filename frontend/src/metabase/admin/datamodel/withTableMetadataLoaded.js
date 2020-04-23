import React, { Component } from "react";

export default ComposedComponent => {
  class TableMetadataLoader extends Component {
    componentDidMount() {
      const { table } = this.props;
      if (table) {
        table.fetchMetadataAndForeignTables();
      }
    }

    componentDidUpdate(prevProps) {
      const { table } = this.props;
      if (table !== prevProps.table) {
        table.fetchMetadataAndForeignTables();
      }
    }

    render() {
      return <ComposedComponent {...this.props} />;
    }
  }

  return TableMetadataLoader;
};
