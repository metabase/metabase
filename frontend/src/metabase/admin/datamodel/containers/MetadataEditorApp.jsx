/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { push, replace } from "react-router-redux";
import _ from "underscore";

import { t } from "ttag";
import * as MetabaseAnalytics from "metabase/lib/analytics";

import AdminEmptyText from "metabase/components/AdminEmptyText";
import MetadataHeader from "../components/database/MetadataHeader";
import MetadataTablePicker from "../components/database/MetadataTablePicker";
import MetadataTable from "../components/database/MetadataTable";
import MetadataSchema from "../components/database/MetadataSchema";
import {
  metrics as Metrics,
  databases as Databases,
  fields as Fields,
} from "metabase/entities";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";

const propTypes = {
  databaseId: PropTypes.number,
  database: PropTypes.object,
  loading: PropTypes.bool,
  tableId: PropTypes.number,
  selectDatabase: PropTypes.func.isRequired,
  selectTable: PropTypes.func.isRequired,
  idfields: PropTypes.array,
  updateField: PropTypes.func.isRequired,
  onRetireMetric: PropTypes.func.isRequired,
};

const mapStateToProps = (state, { params }) => {
  const databaseId = params.databaseId
    ? parseInt(params.databaseId)
    : undefined;
  const tableId = params.tableId ? parseInt(params.tableId) : undefined;
  return {
    databaseId,
    tableId,
    idfields: Databases.selectors.getIdfields(state, { databaseId }),
  };
};

const mapDispatchToProps = {
  selectDatabase: ({ id }, shouldReplace) =>
    shouldReplace
      ? replace(`/admin/datamodel/database/${id}`)
      : push(`/admin/datamodel/database/${id}`),
  selectTable: ({ id, db_id }) =>
    push(`/admin/datamodel/database/${db_id}/table/${id}`),
  updateField: field => Fields.actions.updateField(field),
  onRetireMetric: ({ id, ...rest }) =>
    Metrics.actions.setArchived({ id }, true, rest),
};

class MetadataEditorInner extends Component {
  constructor(props, context) {
    super(props, context);
    this.toggleShowSchema = this.toggleShowSchema.bind(this);

    this.state = {
      isShowingSchema: false,
    };
  }

  toggleShowSchema() {
    this.setState({ isShowingSchema: !this.state.isShowingSchema });
    MetabaseAnalytics.trackStructEvent(
      "Data Model",
      "Show OG Schema",
      !this.state.isShowingSchema,
    );
  }

  render() {
    const { databaseId, tableId, database, loading } = this.props;
    const hasLoadedDatabase = !loading && database;
    return (
      <div className="p4">
        <MetadataHeader
          databaseId={databaseId}
          selectDatabase={this.props.selectDatabase}
          isShowingSchema={this.state.isShowingSchema}
          toggleShowSchema={this.toggleShowSchema}
        />
        <div
          style={{ minHeight: "60vh" }}
          className="flex flex-row flex-full mt2 full-height"
        >
          {hasLoadedDatabase && (
            <MetadataTablePicker
              tableId={tableId}
              databaseId={databaseId}
              selectTable={this.props.selectTable}
            />
          )}
          {tableId ? (
            this.state.isShowingSchema ? (
              <MetadataSchema tableId={tableId} />
            ) : (
              <MetadataTable
                tableId={tableId}
                databaseId={databaseId}
                idfields={this.props.idfields}
                updateField={this.props.updateField}
                onRetireMetric={this.props.onRetireMetric}
              />
            )
          ) : (
            <div style={{ paddingTop: "10rem" }} className="full text-centered">
              {!loading && (
                <AdminEmptyText
                  message={
                    hasLoadedDatabase
                      ? t`Select any table to see its schema and add or edit metadata.`
                      : t`The page you asked for couldn't be found.`
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
}

const MetadataEditor = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  Databases.load({
    id: (state, props) => props.databaseId,
    query: {
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    },
    loadingAndErrorWrapper: false,
  }),
)(MetadataEditorInner);

MetadataEditor.propTypes = propTypes;

export default MetadataEditor;
