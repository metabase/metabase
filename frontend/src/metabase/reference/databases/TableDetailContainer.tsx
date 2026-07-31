import cx from "classnames";
import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";

import CS from "metabase/css/core/index.css";
import { connect, useSelector } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import TableDetail from "metabase/reference/databases/TableDetail";
import * as actions from "metabase/reference/reference";
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
  ...metadataActions,
  ...actions,
};

interface TableDetailContainerProps extends FetchProps, ClearStateProps {
  fetchDatabaseMetadata: (id: number) => Promise<unknown>;
}

function TableDetailContainer(props: TableDetailContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const params = useParams<ReferenceRouteParams>();

  const database = useSelector((state) => getDatabase(state, { params }));
  const table = useSelector((state) => getTable(state, { params }));
  const databaseId = useSelector((state) => getDatabaseId(state, { params }));
  const isEditing = useSelector(getIsEditing);

  // Dispatched during render, not from an effect, to reproduce the
  // `UNSAFE_componentWillMount` this replaced: the child reads `loading` from
  // the store, so it has to be true before the child's first render. From an
  // effect (even `useLayoutEffect`) the tree commits once with no data, and the
  // reference header lays out wrong — see DEV-2430.
  const didFetch = useRef(false);
  if (!didFetch.current) {
    didFetch.current = true;
    actions.wrappedFetchDatabaseMetadata(props, databaseId);
  }

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
