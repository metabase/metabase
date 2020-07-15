import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { push, replace } from "react-router-redux";

import { t } from "ttag";
import MetabaseAnalytics from "metabase/lib/analytics";

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
  updateField: field => Fields.actions.update(field),
  onRetireMetric: ({ id, ...rest }) =>
    Metrics.actions.setArchived({ id }, true, rest),
};

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
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
    selectDatabase: PropTypes.func.isRequired,
    selectTable: PropTypes.func.isRequired,
    idfields: PropTypes.array,
    updateField: PropTypes.func.isRequired,
    onRetireMetric: PropTypes.func.isRequired,
  };

  toggleShowSchema() {
    this.setState({ isShowingSchema: !this.state.isShowingSchema });
    MetabaseAnalytics.trackEvent(
      "Data Model",
      "Show OG Schema",
      !this.state.isShowingSchema,
    );
  }

  render() {
    const { databaseId, tableId } = this.props;
    return (
      <div className="p3">
        <MetadataHeader
          ref="header"
          databaseId={databaseId}
          selectDatabase={this.props.selectDatabase}
          isShowingSchema={this.state.isShowingSchema}
          toggleShowSchema={this.toggleShowSchema}
        />
        <div
          style={{ minHeight: "60vh" }}
          className="flex flex-row flex-full mt2 full-height"
        >
          {databaseId && (
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
              <AdminEmptyText
                message={t`Select any table to see its schema and add or edit metadata.`}
              />
            </div>
          )}
        </div>
      </div>
    );
  }
}
