import React, { Component } from "react";
import PropTypes from "prop-types";

import MetadataTableList from "./MetadataTableList";
import MetadataSchemaList from "./MetadataSchemaList";

import Tables from "metabase/entities/tables";

import _ from "underscore";

@Tables.loadList({
  query: (state, { databaseId }) => ({ dbId: databaseId }),
})
export default class MetadataTablePicker extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      schemas: null,
      selectedSchema: null,
      showTablePicker: true,
    };
  }

  static propTypes = {
    tableId: PropTypes.number,
    databaseId: PropTypes.number,
    selectTable: PropTypes.func.isRequired,
  };

  componentWillMount() {
    this.componentWillReceiveProps(this.props);
  }

  componentWillReceiveProps({ tables, tableId }) {
    const table = tables.find(t => t.id === tableId);
    const schemas = _.uniq(tables.map(t => t.schema)).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    this.setState({
      schemas: schemas,
      selectedSchema: table && table.schema,
    });
  }

  render() {
    const { schemas } = this.state;
    if (schemas.length === 1) {
      return <MetadataTableList {...this.props} tables={schemas[0].tables} />;
    }
    if (this.state.selectedSchema && this.state.showTablePicker) {
      return (
        <MetadataTableList
          {...this.props}
          tables={this.state.selectedSchema.tables}
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
