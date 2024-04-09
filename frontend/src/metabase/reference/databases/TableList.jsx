/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import EmptyState from "metabase/components/EmptyState";
import List from "metabase/components/List";
import S from "metabase/components/List/List.module.css";
import ListItem from "metabase/components/ListItem";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import * as metadataActions from "metabase/redux/metadata";
import R from "metabase/reference/Reference.module.css";

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

const createListItem = table => (
  <ListItem
    data-testid="table-list-item"
    key={table.id}
    name={table.display_name || table.name}
    description={table.description}
    disabled={table.initial_sync_status !== "complete"}
    url={`/reference/databases/${table.db_id}/tables/${table.id}`}
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
    .sortBy(t => t.name)
    .sortBy(t => t.schema_name)
    .value();

  return sortedTables.map((table, index, sortedTables) => {
    if (!table || !table.id || !table.name) {
      return;
    }
    // add schema header for first element and if schema is different from previous
    const previousTableId = Object.keys(sortedTables)[index - 1];
    return index === 0 ||
      sortedTables[previousTableId].schema_name !== table.schema_name
      ? [createSchemaSeparator(table), createListItem(table)]
      : createListItem(table);
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
      <div style={style} className={CS.full} data-testid="table-list">
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
              <div className={cx(CS.wrapper, CS.wrapperTrim)}>
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
