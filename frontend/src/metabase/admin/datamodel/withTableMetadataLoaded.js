import React, { Component } from "react";

export default ComposedComponent => {
  class TableMetadataLoader extends Component {
    componentDidMount() {
      const { table } = this.props;
      if (table) {
        table.fetchMetadataAndForeignTables({
          params: { include_sensitive_fields: true },
        });
      }
    }

    componentDidUpdate(prevProps) {
      const { table } = this.props;
      if (table !== prevProps.table) {
        table.fetchMetadataAndForeignTables({
          params: { include_sensitive_fields: true },
        });
      }
    }

    render() {
      return <ComposedComponent {...this.props} />;
    }
  }

  return TableMetadataLoader;
};
