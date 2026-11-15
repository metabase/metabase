import cx from "classnames";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import CS from "metabase/css/core/index.css";
import { connect, useSelector } from "metabase/redux";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import TableList from "metabase/reference/databases/TableList";
import * as actions from "metabase/reference/reference";
import { useLocation, useParams } from "metabase/router";

import type { ClearStateProps } from "../reference";
import {
  type ReferenceRouteParams,
  getDatabaseId,
  getIsEditing,
} from "../selectors";

import DatabaseSidebar from "./DatabaseSidebar";
import { useReferenceDatabase } from "./use-reference-database";

const mapDispatchToProps = {
  ...actions,
};

type TableListContainerProps = ClearStateProps;

function TableListContainer(props: TableListContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const params = useParams<ReferenceRouteParams>();

  const databaseId = useSelector((state) => getDatabaseId(state, { params }));
  const isEditing = useSelector(getIsEditing);
  const { database, tables, isLoading, error } =
    useReferenceDatabase(databaseId);

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
        <DatabaseSidebar
          databaseId={databaseId}
          databaseName={database?.name}
        />
      }
    >
      <TableList
        database={database}
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
)(TableListContainer as unknown as React.ComponentType);
