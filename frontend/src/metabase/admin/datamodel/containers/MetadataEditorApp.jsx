import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import _ from "underscore";
import { t } from "c-3po";
import MetabaseAnalytics from "metabase/lib/analytics";

import AdminEmptyText from "metabase/components/AdminEmptyText.jsx";
import MetadataHeader from "../components/database/MetadataHeader.jsx";
import MetadataTablePicker from "../components/database/MetadataTablePicker.jsx";
import MetadataTable from "../components/database/MetadataTable.jsx";
import MetadataSchema from "../components/database/MetadataSchema.jsx";

import {
  getDatabases,
  getDatabaseIdfields,
  getEditingDatabaseWithTableMetadataStrengths,
  getEditingTable,
} from "../selectors";
import * as metadataActions from "../datamodel";

const mapStateToProps = (state, props) => {
  return {
    databaseId: parseInt(props.params.databaseId),
    tableId: parseInt(props.params.tableId),
    databases: getDatabases(state, props),
    idfields: getDatabaseIdfields(state, props),
    databaseMetadata: getEditingDatabaseWithTableMetadataStrengths(
      state,
      props,
    ),
    editingTable: getEditingTable(state, props),
  };
};

const mapDispatchToProps = {
  ...metadataActions,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class MetadataEditor extends Component {
  constructor(props, context) {
    super(props, context);
    this.toggleShowSchema = this.toggleShowSchema.bind(this);

    this.state = {
      isShowingSchema: false,
    };
  }

  static propTypes = {
    databaseId: PropTypes.number,
    tableId: PropTypes.number,
    databases: PropTypes.array.isRequired,
    selectDatabase: PropTypes.func.isRequired,
    databaseMetadata: PropTypes.object,
    selectTable: PropTypes.func.isRequired,
    idfields: PropTypes.array.isRequired,
    editingTable: PropTypes.number,
    updateTable: PropTypes.func.isRequired,
    updateField: PropTypes.func.isRequired,
  };

  componentWillMount() {
    // if we know what database we are initialized with, include that
    this.props.initializeMetadata(this.props.databaseId, this.props.tableId);
  }

  toggleShowSchema() {
    this.setState({ isShowingSchema: !this.state.isShowingSchema });
    MetabaseAnalytics.trackEvent(
      "Data Model",
      "Show OG Schema",
      !this.state.isShowingSchema,
    );
  }

  render() {
    let tableMetadata = this.props.databaseMetadata
      ? _.findWhere(this.props.databaseMetadata.tables, {
          id: this.props.editingTable,
        })
      : null;
    let content;
    if (tableMetadata) {
      if (this.state.isShowingSchema) {
        content = <MetadataSchema tableMetadata={tableMetadata} />;
      } else {
        content = (
          <MetadataTable
            tableMetadata={tableMetadata}
            idfields={this.props.idfields}
            updateTable={table => this.props.updateTable(table)}
            updateField={field => this.props.updateField(field)}
            onRetireSegment={this.props.onRetireSegment}
            onRetireMetric={this.props.onRetireMetric}
          />
        );
      }
    } else {
      content = (
        <div style={{ paddingTop: "10rem" }} className="full text-centered">
          <AdminEmptyText
            message={t`Select any table to see its schema and add or edit metadata.`}
          />
        </div>
      );
    }
    return (
      <div className="p3">
        <MetadataHeader
          ref="header"
          databaseId={
            this.props.databaseMetadata ? this.props.databaseMetadata.id : null
          }
          databases={this.props.databases}
          selectDatabase={this.props.selectDatabase}
          isShowingSchema={this.state.isShowingSchema}
          toggleShowSchema={this.toggleShowSchema}
        />
        <div
          style={{ minHeight: "60vh" }}
          className="flex flex-row flex-full mt2 full-height"
        >
          <MetadataTablePicker
            tableId={this.props.editingTable}
            tables={
              this.props.databaseMetadata
                ? this.props.databaseMetadata.tables
                : []
            }
            selectTable={this.props.selectTable}
          />
          {content}
        </div>
      </div>
    );
  }
}
