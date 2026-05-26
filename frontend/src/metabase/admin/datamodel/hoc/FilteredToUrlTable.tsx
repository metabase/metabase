import cx from "classnames";
import type { Location } from "history";
import { type ComponentType, type ReactNode, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken, useGetTableQuery } from "metabase/api";
import { FieldSet } from "metabase/common/components/FieldSet";
import CS from "metabase/css/core/index.css";
import { DatabaseSchemaAndTableDataSelector } from "metabase/querying/common/components/DataSelector";
import { connect, useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Icon } from "metabase/ui";
import type { ConcreteTableId, Segment } from "metabase-types/api";

type LocationWithQuery = Location<{
  table?: string;
}>;

type FilteredToUrlTableInnerProps = {
  location: LocationWithQuery;
  push: (location: LocationWithQuery) => void;
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
    push,
    segments,
    ...props
  }: FilteredToUrlTableInnerProps) => {
    const [tableId, setTableIdState] = useState<ConcreteTableId | null>(() =>
      getTableIdFromLocation(location),
    );

    const setTableId = (newTableId: ConcreteTableId | null) => {
      setTableIdState(newTableId);
      push({
        ...location,
        query: newTableId == null ? {} : { table: String(newTableId) },
      });
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

  return connect(null, { push })(Inner);
}

type TableSelectorProps = {
  tableId: ConcreteTableId | null;
  setTableId: (tableId: ConcreteTableId | null) => void;
};

function TableSelector({ tableId, setTableId }: TableSelectorProps) {
  useGetTableQuery(tableId != null ? { id: tableId } : skipToken);
  const table = useSelector((state) =>
    tableId != null ? getMetadata(state).table(tableId) : null,
  );

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
