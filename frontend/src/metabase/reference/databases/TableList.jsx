/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import S from "metabase/components/List/List.css";
import R from "metabase/reference/Reference.css";

import List from "metabase/components/List";
import ListItem from "metabase/components/ListItem";
import EmptyState from "metabase/components/EmptyState";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import * as metadataActions from "metabase/redux/metadata";
import ReferenceHeader from "../components/ReferenceHeader";

import {
  getDatabase,
  getTablesByDatabase,
  getHasSingleSchema,
  getError,
  getLoading,
} from "../selectors";

const emptyStateData = {
  message: t`Tables in this database will appear here as they're added`,
  icon: "table2",
};

const mapStateToProps = (state, props) => ({
  database: getDatabase(state, props),
  entities: getTablesByDatabase(state, props),
  hasSingleSchema: getHasSingleSchema(state, props),
  loading: getLoading(state, props),
  loadingError: getError(state, props),
});

const mapDispatchToProps = {
  ...metadataActions,
};

const createListItem = entity => (
  <ListItem
    key={entity.id}
    name={entity.display_name || entity.name}
    description={entity.description}
    url={`/reference/databases/${entity.db_id}/tables/${entity.id}`}
    icon="table2"
  />
);

const createSchemaSeparator = table => (
  <li className={R.schemaSeparator}>{table.schema_name}</li>
);

export const separateTablesBySchema = (
  tables,
  createSchemaSeparator,
  createListItem,
) => {
  const sortedTables = _.chain(tables)
    .sortBy(t => t.schema_name)
    .sortBy(t => t.name)
    .value();

  return sortedTables.map((table, index, sortedTables) => {
    if (!table || !table.id || !table.name) {
      return;
    }
    // add schema header for first element and if schema is different from previous
    const previousTableId = Object.keys(sortedTables)[index - 1];
    return index === 0 ||
      sortedTables[previousTableId].schema_name !== table.schema_name
      ? [createSchemaSeparator(table), createListItem(table, index)]
      : createListItem(table, index);
  });
};

class TableList extends Component {
  static propTypes = {
    style: PropTypes.object.isRequired,
    entities: PropTypes.object.isRequired,
    database: PropTypes.object.isRequired,
    hasSingleSchema: PropTypes.bool,
    loading: PropTypes.bool,
    loadingError: PropTypes.object,
  };

  render() {
    const {
      entities,
      style,
      database,
      hasSingleSchema,
      loadingError,
      loading,
    } = this.props;

    const tables = Object.values(entities);

    return (
      <div style={style} className="full" data-testid="table-list">
        <ReferenceHeader
          name={t`Tables in ${database.name}`}
          type="tables"
          headerIcon="database"
        />
        <LoadingAndErrorWrapper
          loading={!loadingError && loading}
          error={loadingError}
        >
          {() =>
            tables.length > 0 ? (
              <div className="wrapper wrapper--trim">
                <List>
                  {!hasSingleSchema
                    ? separateTablesBySchema(
                        tables,
                        createSchemaSeparator,
                        createListItem,
                      )
                    : _.sortBy(tables, "name").map(
                        table =>
                          table &&
                          table.id &&
                          table.name &&
                          createListItem(table),
                      )}
                </List>
              </div>
            ) : (
              <div className={S.empty}>
                <EmptyState {...emptyStateData} />
              </div>
            )
          }
        </LoadingAndErrorWrapper>
      </div>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(TableList);
