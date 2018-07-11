/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import { isQueryable } from "metabase/lib/table";

import _ from "underscore";

import S from "metabase/components/List.css";
import R from "metabase/reference/Reference.css";

import List from "metabase/components/List.jsx";
import ListItem from "metabase/components/ListItem.jsx";
import EmptyState from "metabase/components/EmptyState.jsx";

import EntityListLoader from "metabase/entities/containers/EntityListLoader";

import ReferenceHeader from "../components/ReferenceHeader.jsx";

const emptyStateData = {
  message: t`Tables in this database will appear here as they're added`,
  icon: "table2",
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

const createSchemaSeparator = entity => (
  <li className={R.schemaSeparator}>{entity.schema}</li>
);

export const separateTablesBySchema = (
  tables,
  createSchemaSeparator,
  createListItem,
) =>
  tables
    .slice()
    .sort(
      (table1, table2) =>
        table1.schema > table2.schema
          ? 1
          : table1.schema === table2.schema ? 0 : -1,
    )
    .map((table, index, sortedTables) => {
      if (!table || !table.id || !table.name) {
        return;
      }
      // add schema header for first element and if schema is different from previous
      const previousTableId = Object.keys(sortedTables)[index - 1];
      return index === 0 ||
        sortedTables[previousTableId].schema !== table.schema
        ? [createSchemaSeparator(table), createListItem(table, index)]
        : createListItem(table, index);
    });

export default class TableList extends Component {
  static propTypes = {
    style: PropTypes.object.isRequired,
    database: PropTypes.object.isRequired,
  };

  render() {
    const { style, database } = this.props;

    return (
      <div style={style} className="full">
        <ReferenceHeader
          name={t`Tables in ${database.name}`}
          type="tables"
          headerIcon="database"
        />
        <EntityListLoader
          entityType="tables"
          entityQuery={{ dbId: this.props.databaseId }}
        >
          {({ tables }) =>
            tables.length > 0 ? (
              <div className="wrapper wrapper--trim">
                <List>
                  {!_.chain(tables)
                    .map(t => t.schema)
                    .uniq()
                    .value().length > 1
                    ? separateTablesBySchema(
                        tables.filter(isQueryable),
                        createSchemaSeparator,
                        createListItem,
                      )
                    : tables
                        .filter(isQueryable)
                        .map(
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
        </EntityListLoader>
      </div>
    );
  }
}
