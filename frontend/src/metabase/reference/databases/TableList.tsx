import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import R from "metabase/reference/Reference.module.css";
import { List } from "metabase/reference/components/List";
import S from "metabase/reference/components/List/List.module.css";
import { ListItem } from "metabase/reference/components/ListItem";
import type { Database, Table, TableId } from "metabase-types/api";

import ReferenceHeader from "../components/ReferenceHeader";

const emptyStateData = {
  get message() {
    return t`Tables in this database will appear here as they're added`;
  },
  icon: "table2" as const,
};

// Only what the grouping reads, so the spec can drive it with plain objects.
interface TableLike {
  id?: TableId;
  name?: string;
  schema?: string | null;
}

const createListItem = (table: Table) => (
  <ListItem
    data-testid="table-list-item"
    key={table.id}
    name={table.display_name || table.name || ""}
    description={table.description ?? undefined}
    disabled={table.initial_sync_status !== "complete"}
    url={`/reference/databases/${table.db_id}/tables/${table.id}`}
    icon="table2"
  />
);

const createSchemaSeparator = (table: Table) => (
  <li className={R.schemaSeparator}>{table.schema}</li>
);

export const separateTablesBySchema = <T extends TableLike, S, I>(
  tables: Record<string, T> | T[],
  createSchemaSeparator: (table: T) => S,
  createListItem: (table: T) => I,
): Array<I | [S, I] | undefined> => {
  const sortedTables = _.chain(tables)
    .sortBy((table) => table.name)
    .sortBy((table) => table.schema)
    .value();

  return sortedTables.map((table, index, sortedTables) => {
    if (!table || !table.id || !table.name) {
      return;
    }
    // add schema header for first element and if schema is different from previous
    return index === 0 || sortedTables[index - 1].schema !== table.schema
      ? [createSchemaSeparator(table), createListItem(table)]
      : createListItem(table);
  });
};

interface TableListProps {
  database: Database | undefined;
  tables: Table[];
  loading?: boolean;
  loadingError?: unknown;
}

class TableList extends Component<TableListProps> {
  render() {
    const { database, tables, loadingError, loading } = this.props;

    const hasSingleSchema =
      tables.length === 0 ||
      tables.every((table) => table.schema === tables[0].schema);

    return (
      <div data-testid="table-list">
        <ReferenceHeader
          name={t`Tables in ${database?.name}`}
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
export default TableList;
