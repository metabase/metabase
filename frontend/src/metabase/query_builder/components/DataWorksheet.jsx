import React from "react";

import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";

export default class DataWorksheet extends React.Component {
  render() {
    const { databases, query } = this.props;
    const datasetQuery = query.datasetQuery();
    const databaseId = datasetQuery && datasetQuery.database;
    const sourceTableId =
      datasetQuery && datasetQuery.query && datasetQuery.query["source-table"];
    const isInitiallyOpen = !datasetQuery.database || !sourceTableId;

    return (
      <div>
        <span>
          <DatabaseSchemaAndTableDataSelector
            databases={databases}
            selected={sourceTableId}
            selectedDatabaseId={databaseId}
            selectedTableId={sourceTableId}
            setDatabaseFn={this.props.setDatabaseFn}
            setSourceTableFn={this.props.setSourceTableFn}
            isInitiallyOpen={isInitiallyOpen}
            triggerClasses="bordered rounded border-med p1 inline-block"
          />
        </span>
      </div>
    );
  }
}
