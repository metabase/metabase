import React, { Component } from "react";
import PropTypes from "prop-types";

import MetadataTableList from "./MetadataTableList";
import MetadataSchemaList from "./MetadataSchemaList";

import Tables from "metabase/entities/tables";

import _ from "underscore";

@Tables.loadList({
  query: (state, { databaseId }) => ({
    dbId: databaseId,
    include_hidden: true,
  }),
  selectorName: "getListUnfiltered",
})
export default class MetadataTablePicker extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      selectedSchema: null,
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
