// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import React, { useState } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { connect } from "react-redux";
import { push, replace } from "react-router-redux";

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
import { State } from "metabase-types/store";

interface RouteParams {
  tableId: string;
  databaseId: string;
}

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

const mapStateToProps = (state: State, { params }: { params: RouteParams }) => {
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

const MetadataEditor = ({
  databaseId,
  tableId,
  database,
  loading,
  selectDatabase,
  idfields,
  selectTable,
  updateField,
  onRetireMetric,
}: any) => {
  const [isShowingSchema, setIsShowingSchema] = useState(false);

  const hasLoadedDatabase = !loading && database;

  const toggleShowSchema = () => {
    setIsShowingSchema(prev => !prev);

    MetabaseAnalytics.trackStructEvent(
      "Data Model",
      "Show OG Schema",
      !isShowingSchema,
    );
  };

  return (
    <div className="p4">
      <MetadataHeader
        databaseId={databaseId}
        selectDatabase={selectDatabase}
        isShowingSchema={isShowingSchema}
        toggleShowSchema={toggleShowSchema}
      />
      <div
        style={{ minHeight: "60vh" }}
        className="flex flex-row flex-full mt2 full-height"
      >
        {hasLoadedDatabase && (
          <MetadataTablePicker
            tableId={tableId}
            databaseId={databaseId}
            selectTable={selectTable}
          />
        )}
        {tableId ? (
          isShowingSchema ? (
            <MetadataSchema tableId={tableId} />
          ) : (
            <MetadataTable
              tableId={tableId}
              databaseId={databaseId}
              idfields={idfields}
              updateField={updateField}
              onRetireMetric={onRetireMetric}
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
};

export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  Databases.load({
    id: (_state: State, props: RouteParams) => props.databaseId,
    loadingAndErrorWrapper: false,
  }),
)(MetadataEditor);
