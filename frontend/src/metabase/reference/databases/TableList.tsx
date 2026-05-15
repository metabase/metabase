import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import { EmptyState } from "metabase/common/components/EmptyState";
import { List } from "metabase/common/components/List";
import S from "metabase/common/components/List/List.module.css";
import { ListItem } from "metabase/common/components/ListItem";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import R from "metabase/reference/Reference.module.css";

import ReferenceHeader from "../components/ReferenceHeader";
import type { ReferenceRouteProps, StateWithReference } from "../selectors";
import {
  getDatabase,
  getError,
  getHasSingleSchema,
  getLoading,
  getTablesByDatabase,
} from "../selectors";

const emptyStateData = {
  get message() {
    return t`Tables in this database will appear here as they're added`;
  },
  icon: "table2" as const,
};

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => ({
  database: getDatabase(state, props),
  entities: getTablesByDatabase(state, props),
  hasSingleSchema: getHasSingleSchema(state, props),
  loading: getLoading(state),
  loadingError: getError(state),
});

const mapDispatchToProps = {
  ...metadataActions,
};

interface TableLike {
  id?: number | string;
  name?: string;
  display_name?: string;
  description?: string;
  initial_sync_status?: string;
  db_id?: number;
  schema_name?: string;
}

const createListItem = (table: TableLike) => (
  <ListItem
    data-testid="table-list-item"
    key={table.id}
    name={table.display_name || table.name || ""}
    description={table.description}
    disabled={table.initial_sync_status !== "complete"}
    url={`/reference/databases/${table.db_id}/tables/${table.id}`}
    icon="table2"
  />
);

const createSchemaSeparator = (table: TableLike) => (
  <li className={R.schemaSeparator}>{table.schema_name}</li>
);

export const separateTablesBySchema = <T extends TableLike, S, I>(
  tables: Record<string, T> | T[],
  createSchemaSeparator: (table: T) => S,
  createListItem: (table: T) => I,
): Array<I | [S, I] | undefined> => {
  const sortedTables = _.chain(tables)
    .sortBy((table) => table.name)
    .sortBy((table) => table.schema_name)
    .value();

  return sortedTables.map((table, index, sortedTables) => {
    if (!table || !table.id || !table.name) {
      return;
    }
    // add schema header for first element and if schema is different from previous
    return index === 0 ||
      sortedTables[index - 1].schema_name !== table.schema_name
      ? [createSchemaSeparator(table), createListItem(table)]
      : createListItem(table);
  });
};

interface TableListProps {
  entities: Record<string, TableLike>;
  database: { name?: string };
  hasSingleSchema?: boolean;
  loading?: boolean;
  loadingError?: unknown;
}

class TableList extends Component<TableListProps> {
  render() {
    const { entities, database, hasSingleSchema, loadingError, loading } =
      this.props;

    const tables = Object.values(entities);

    return (
      <div data-testid="table-list">
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
                        (table) =>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(TableList as unknown as React.ComponentType);
