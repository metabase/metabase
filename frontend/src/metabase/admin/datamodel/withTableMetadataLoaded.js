import React, { Component } from "react";

export default ComposedComponent => {
  class TableMetadataLoader extends Component {
    componentDidMount() {
      const { table } = this.props;
      if (table) {
        this.fetch();
      }
    }

    componentDidUpdate(prevProps) {
      const { table } = this.props;
      if (table !== prevProps.table) {
        this.fetch();
      }
    }

    fetch() {
      this.props.table.fetchMetadataAndForeignTables({
        params: { include_sensitive_fields: true },
        selectorName: "getObjectUnfiltered",
      });
    }

    render() {
      return <ComposedComponent {...this.props} />;
    }
  }

  return TableMetadataLoader;
};
