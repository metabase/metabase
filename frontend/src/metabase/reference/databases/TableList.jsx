/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import S from "metabase/components/List.css";
import R from "metabase/reference/Reference.css";

import List from "metabase/components/List";
import ListItem from "metabase/components/ListItem";
import EmptyState from "metabase/components/EmptyState";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import ReferenceHeader from "../components/ReferenceHeader";

import {
  getDatabase,
  getTablesByDatabase,
  getHasSingleSchema,
  getError,
  getLoading,
} from "../selectors";

import * as metadataActions from "metabase/redux/metadata";

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

const createListItem = (entity, index) => (
  <li className="relative" key={entity.id}>
    <ListItem
      id={entity.id}
      index={index}
      name={entity.display_name || entity.name}
      description={entity.description}
      url={`/reference/databases/${entity.db_id}/tables/${entity.id}`}
      icon="table2"
    />
  </li>
);

const createSchemaSeparator = table => (
  <li className={R.schemaSeparator}>{table.schema_name}</li>
);

export const separateTablesBySchema = (
  tables,
  createSchemaSeparator,
  createListItem,
) =>
  Object.values(tables)
    .sort((table1, table2) =>
      table1.schema_name > table2.schema_name
        ? 1
        : table1.schema_name === table2.schema_name
        ? 0
        : -1,
    )
    .map((table, index, sortedTables) => {
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

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class TableList extends Component {
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

    return (
      <div style={style} className="full">
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
            Object.keys(entities).length > 0 ? (
              <div className="wrapper wrapper--trim">
                <List>
                  {!hasSingleSchema
                    ? separateTablesBySchema(
                        entities,
                        createSchemaSeparator,
                        createListItem,
                      )
                    : Object.values(entities).map(
                        (entity, index) =>
                          entity &&
                          entity.id &&
                          entity.name &&
                          createListItem(entity, index),
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
