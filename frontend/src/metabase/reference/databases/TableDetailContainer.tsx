import cx from "classnames";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import { useGetDatabaseMetadataQuery } from "metabase/api";
import CS from "metabase/css/core/index.css";
import { connect, useSelector } from "metabase/redux";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import TableDetail from "metabase/reference/databases/TableDetail";
import * as actions from "metabase/reference/reference";
import { useReferenceFetchState } from "metabase/reference/use-reference-fetch-state";
import { useLocation, useParams } from "metabase/router";

import type { ClearStateProps, FetchProps } from "../reference";
import {
  type ReferenceRouteParams,
  getDatabase,
  getDatabaseId,
  getIsEditing,
  getTable,
} from "../selectors";

import TableSidebar from "./TableSidebar";

const mapDispatchToProps = {
  ...actions,
};

interface TableDetailContainerProps extends FetchProps, ClearStateProps {}

function TableDetailContainer(props: TableDetailContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const params = useParams<ReferenceRouteParams>();

  const database = useSelector((state) => getDatabase(state, { params }));
  const table = useSelector((state) => getTable(state, { params }));
  const databaseId = useSelector((state) => getDatabaseId(state, { params }));
  const isEditing = useSelector(getIsEditing);

  const { isFetching, error } = useGetDatabaseMetadataQuery({
    id: databaseId,
    skip_fields: true,
  });
  useReferenceFetchState({ isFetching, error });

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
      sidebar={<TableSidebar database={database} table={table} />}
    >
      <TableDetail params={params} />
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
