/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import Tables from "metabase/entities/tables";
import { isSyncInProgress } from "metabase/lib/syncing";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import MetadataTableList from "./MetadataTableList";
import MetadataSchemaList from "./MetadataSchemaList";

const RELOAD_INTERVAL = 2000;

class MetadataTablePicker extends Component {
  constructor(props, context) {
    super(props, context);

    const { tables, tableId } = props;
    const selectedTable = _.findWhere(tables, { id: tableId });
    this.state = {
      selectedSchema: selectedTable ? selectedTable.schema_name : null,
      showTablePicker: true,
    };
  }

  static propTypes = {
    tableId: PropTypes.number,
    databaseId: PropTypes.number,
    selectTable: PropTypes.func.isRequired,
  };

  render() {
    const tablesBySchemaName = _.groupBy(this.props.tables, t => t.schema_name);
    const schemas = Object.keys(tablesBySchemaName).sort((a, b) =>
      a.localeCompare(b),
    );
    if (schemas.length === 1) {
      return (
        <MetadataTableList
          {...this.props}
          tables={tablesBySchemaName[schemas[0]]}
        />
      );
    }
    if (this.state.selectedSchema && this.state.showTablePicker) {
      return (
        <MetadataTableList
          {...this.props}
          tables={tablesBySchemaName[this.state.selectedSchema]}
          schema={this.state.selectedSchema}
          onBack={() => this.setState({ showTablePicker: false })}
        />
      );
    }
    return (
      <MetadataSchemaList
        schemas={schemas}
        selectedSchema={this.state.selectedSchema}
        onChangeSchema={schema =>
          this.setState({ selectedSchema: schema, showTablePicker: true })
        }
      />
    );
  }
}

export default Tables.loadList({
  query: (state, { databaseId }) => ({
    dbId: databaseId,
    include_hidden: true,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  }),
  reloadInterval: (state, props, tables = []) => {
    return tables.some(t => isSyncInProgress(t)) ? RELOAD_INTERVAL : 0;
  },
  selectorName: "getListUnfiltered",
})(MetadataTablePicker);
