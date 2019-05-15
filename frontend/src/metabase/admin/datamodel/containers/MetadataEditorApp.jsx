import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import { t } from "ttag";
import MetabaseAnalytics from "metabase/lib/analytics";

import AdminEmptyText from "metabase/components/AdminEmptyText.jsx";
import MetadataHeader from "../components/database/MetadataHeader.jsx";
import MetadataTablePicker from "../components/database/MetadataTablePicker.jsx";
import MetadataTable from "../components/database/MetadataTable.jsx";
import MetadataSchema from "../components/database/MetadataSchema.jsx";
import {
  metrics as Metrics,
  segments as Segments,
  databases as Databases,
} from "metabase/entities";

const mapStateToProps = (state, { params: { tableId, databaseId } }) => ({
  idfields: Databases.selectors.getIdfields(state, databaseId),
  databaseId: databaseId ? parseInt(databaseId) : undefined,
  tableId: tableId ? parseInt(tableId) : undefined,
});

const mapDispatchToProps = {
  selectDatabase: ({ id }) => push("/admin/datamodel/database/" + id),
  selectTable: ({ id, db_id }) =>
    push(`/admin/datamodel/database/${db_id}/table/${id}`),
  onRetireMetric: metric => Metrics.actions.setArchived(metric, true),
  onRetireSegment: segment => Segments.actions.setArchived(segment, true),
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
    onRetireMetric: PropTypes.func.isRequired,
    onRetireSegment: PropTypes.func.isRequired,
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
                idfields={this.props.idfields}
                onRetireMetric={this.props.onRetireMetric}
                onRetireSegment={this.props.onRetireSegment}
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
