import cx from "classnames";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import CS from "metabase/css/core/index.css";
import { connect, useSelector } from "metabase/redux";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import TableDetail from "metabase/reference/databases/TableDetail";
import * as actions from "metabase/reference/reference";
import { useLocation, useParams } from "metabase/router";

import type { ClearStateProps } from "../reference";
import {
  type ReferenceRouteParams,
  getDatabaseId,
  getIsEditing,
  getTableId,
} from "../selectors";

import TableSidebar from "./TableSidebar";
import { useReferenceTable } from "./use-reference-database";

const mapDispatchToProps = {
  ...actions,
};

type TableDetailContainerProps = ClearStateProps;

function TableDetailContainer(props: TableDetailContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const params = useParams<ReferenceRouteParams>();

  const databaseId = useSelector((state) => getDatabaseId(state, { params }));
  const tableId = useSelector((state) => getTableId(state, { params }));
  const isEditing = useSelector(getIsEditing);
  const { database, tables, table, isLoading, error } = useReferenceTable(
    databaseId,
    tableId,
  );

  useEffect(() => {
    const pathnameChanged =
      previousPathname !== undefined && previousPathname !== pathname;
    if (pathnameChanged) {
      actions.clearState(props);
    }
  }, [pathname, previousPathname, props]);

  return (
    <SidebarLayout
      className={cx(CS.flexFull, CS.relative)}
      style={isEditing ? { paddingTop: "43px" } : {}}
      sidebar={
        <TableSidebar
          databaseId={databaseId}
          databaseName={database?.name}
          tableId={tableId}
          tableName={table?.name}
        />
      }
    >
      <TableDetail
        table={table}
        tables={tables}
        loading={isLoading}
        loadingError={error}
      />
    </SidebarLayout>
  );
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  null,
  mapDispatchToProps,
  // Unjustified type cast. FIXME
)(TableDetailContainer as unknown as React.ComponentType);
