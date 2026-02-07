import cx from "classnames";
import type { ComponentType } from "react";
import { Component } from "react";
import type { InjectedRouter, PlainRoute } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { FieldSet } from "metabase/common/components/FieldSet";
import CS from "metabase/css/core/index.css";
import { Tables } from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";
import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import { Icon } from "metabase/ui";
import type Table from "metabase-lib/v1/metadata/Table";

interface LocationWithQuery {
  query?: { table?: string };
  [key: string]: unknown;
}

interface FilteredToUrlTableProps {
  location: LocationWithQuery;
  push: (location: LocationWithQuery) => void;
  [key: string]: unknown;
}

interface FilteredToUrlTableState {
  tableId: number | null;
}

/**
 * @deprecated HOCs are deprecated
 */
export const FilteredToUrlTable =
  (propName: string) =>
  <P extends object>(ComposedComponent: ComponentType<P>) =>
    connect(null, { push })(
      class FilteredToUrlTable extends Component<
        FilteredToUrlTableProps,
        FilteredToUrlTableState
      > {
        constructor(props: FilteredToUrlTableProps) {
          super(props);
          const { table } = props.location.query || {};
          this.state = { tableId: table != null ? parseInt(table) : null };
        }

        setTableId = (tableId: number | null) => {
          this.setState({ tableId });
          this.props.push({
            ...this.props.location,
            query: tableId == null ? {} : { table: tableId },
          });
        };

        render() {
          const { [propName]: items, ...otherProps } = this.props;
          const { tableId } = this.state;
          const props = {
            [propName]:
              tableId == null
                ? items
                : items.filter((item: any) => item.table_id === tableId),
            tableSelector: (
              <TableSelector tableId={tableId} setTableId={this.setTableId} />
            ),
            ...otherProps,
          };
          return <ComposedComponent {...(props as P)} />;
        }
      },
    );

interface TableSelectorInnerProps {
  table?: Table;
  tableId: number | null;
  setTableId: (tableId: number | null) => void;
}

class TableSelectorInner extends Component<TableSelectorInnerProps> {
  render() {
    const { table, tableId, setTableId } = this.props;
    return (
      <FieldSet
        noPadding
        className={cx(CS.p0, { [CS.borderBrand]: tableId != null })}
      >
        <div className={CS.p2} style={{ width: 200 }}>
          <DatabaseSchemaAndTableDataSelector
            selectedTableId={tableId}
            setSourceTableFn={setTableId}
            triggerElement={
              <span
                className={cx(
                  CS.flex,
                  CS.alignCenter,
                  CS.justifyBetween,
                  CS.flexFull,
                  CS.textMedium,
                  CS.textBold,
                )}
                data-testid="segment-list-table"
              >
                {table ? table.displayName() : t`Filter by table`}
                <Icon
                  name={table ? "close" : "chevrondown"}
                  size={12}
                  onClick={(e) => {
                    if (table) {
                      e.stopPropagation();
                      setTableId(null);
                    }
                  }}
                />
              </span>
            }
          />
        </div>
      </FieldSet>
    );
  }
}

const TableSelector = Tables.load({
  id: (state: unknown, props: { tableId: number | null }) => props.tableId,
  loadingAndErrorWrapper: false,
})(TableSelectorInner);
