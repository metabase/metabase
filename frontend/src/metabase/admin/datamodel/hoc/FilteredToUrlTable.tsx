import cx from "classnames";
import type { Location } from "history";
import { type ComponentType, type ReactNode, useState } from "react";
import { t } from "ttag";

import { FieldSet } from "metabase/common/components/FieldSet";
import CS from "metabase/css/core/index.css";
import { Tables } from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";
import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import { useNavigation } from "metabase/routing/compat";
import { Icon } from "metabase/ui";
import type { ConcreteTableId, Segment, Table } from "metabase-types/api";
import type { State } from "metabase-types/store";

type LocationWithQuery = Location<{
  table?: string;
}>;

type FilteredToUrlTableInnerProps = {
  location: LocationWithQuery;
  segments: Segment[];
};

function getTableIdFromLocation(
  location: LocationWithQuery,
): ConcreteTableId | null {
  const tableId = location.query?.table;
  return tableId != null ? parseInt(tableId, 10) : null;
}

/**
 * @deprecated HOCs are deprecated
 */
export function FilteredToUrlTable(
  ComposedComponent: ComponentType<{
    segments: Segment[];
    tableSelector: ReactNode;
  }>,
) {
  const Inner = ({
    location,
    segments,
    ...props
  }: FilteredToUrlTableInnerProps) => {
    const { push } = useNavigation();
    const [tableId, setTableIdState] = useState<ConcreteTableId | null>(() =>
      getTableIdFromLocation(location),
    );

    const setTableId = (newTableId: ConcreteTableId | null) => {
      setTableIdState(newTableId);
      const query = newTableId == null ? "" : `?table=${newTableId}`;
      push(`${location.pathname}${query}`);
    };

    const filteredItems =
      tableId == null
        ? segments
        : segments.filter((item) => item.table_id === tableId);

    const composedProps = {
      segments: filteredItems,
      tableSelector: (
        <TableSelector tableId={tableId} setTableId={setTableId} />
      ),
      ...props,
    };

    return <ComposedComponent {...composedProps} />;
  };

  return connect()(Inner);
}

type TableSelectorInnerProps = {
  table?: Table & {
    // Attributes from entity framework object wrapper
    displayName(): string;
  };
  tableId: ConcreteTableId | null;
  setTableId: (tableId: ConcreteTableId | null) => void;
};

function TableSelectorInner({
  table,
  tableId,
  setTableId,
}: TableSelectorInnerProps) {
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
                onClick={(event) => {
                  if (table) {
                    event.stopPropagation();
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

const TableSelector = Tables.load({
  id: (_state: State, props: { tableId: ConcreteTableId | null }) =>
    props.tableId,
  loadingAndErrorWrapper: false,
})(TableSelectorInner);
