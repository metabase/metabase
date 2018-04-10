import React, { Component } from "react";
import PropTypes from "prop-types";

import MetadataTableList from "./MetadataTableList.jsx";
import MetadataSchemaList from "./MetadataSchemaList.jsx";

import { titleize, humanize } from "metabase/lib/formatting";

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
    tables: PropTypes.array.isRequired,
    selectTable: PropTypes.func.isRequired,
  };

  componentWillMount() {
    this.componentWillReceiveProps(this.props);
  }

  componentWillReceiveProps(newProps) {
    const { tables } = newProps;
    let schemas = {};
    let selectedSchema;
    for (let table of tables) {
      let name = table.schema || ""; // possibly null
      schemas[name] = schemas[name] || {
        name: titleize(humanize(name)),
        tables: [],
      };
      schemas[name].tables.push(table);
      if (table.id === newProps.tableId) {
        selectedSchema = schemas[name];
      }
    }
    this.setState({
      schemas: Object.values(schemas).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      selectedSchema: selectedSchema,
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
        selectedSchema={this.state.schema}
        onChangeSchema={schema =>
          this.setState({ selectedSchema: schema, showTablePicker: true })
        }
      />
    );
  }
}
