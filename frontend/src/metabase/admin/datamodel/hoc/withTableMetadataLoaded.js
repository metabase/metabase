/* eslint-disable react/prop-types */
import { Component } from "react";

import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";

/**
 * @deprecated HOCs are deprecated
 */
export default ComposedComponent => {
  class TableMetadataLoader extends Component {
    componentDidMount() {
      const { table } = this.props;
      if (table) {
        this.fetch();
      }
    }

    componentDidUpdate({ table: prevTable }) {
      const { table } = this.props;
      if (table != null && table.id !== (prevTable || {}).id) {
        this.fetch();
      }
    }

    fetch() {
      this.props.table.fetchMetadataAndForeignTables({
        params: {
          include_sensitive_fields: true,
          ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
        },
      });
    }

    render() {
      return <ComposedComponent {...this.props} />;
    }
  }

  return TableMetadataLoader;
};
