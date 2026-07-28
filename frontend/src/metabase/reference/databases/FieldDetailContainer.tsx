import cx from "classnames";
import { useEffect } from "react";
import { useMount, usePrevious } from "react-use";

import CS from "metabase/css/core/index.css";
import { connect, useSelector } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import FieldDetail from "metabase/reference/databases/FieldDetail";
import * as actions from "metabase/reference/reference";
import { useLocation, useParams } from "metabase/router";

import type { ClearStateProps, FetchProps } from "../reference";
import {
  type ReferenceRouteParams,
  getDatabase,
  getDatabaseId,
  getField,
  getIsEditing,
  getTable,
} from "../selectors";

import FieldSidebar from "./FieldSidebar";

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

interface FieldDetailContainerProps extends FetchProps, ClearStateProps {
  fetchDatabaseMetadata: (id: number) => Promise<unknown>;
}

function FieldDetailContainer(props: FieldDetailContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const params = useParams<ReferenceRouteParams>();

  const database = useSelector((state) => getDatabase(state, { params }));
  const table = useSelector((state) => getTable(state, { params }));
  const field = useSelector((state) => getField(state, { params }));
  const databaseId = useSelector((state) => getDatabaseId(state, { params }));
  const isEditing = useSelector(getIsEditing);

  useMount(() => {
    actions.wrappedFetchDatabaseMetadata(props, databaseId);
  });

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
      sidebar={<FieldSidebar database={database} table={table} field={field} />}
    >
      <FieldDetail params={params} />
    </SidebarLayout>
  );
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  null,
  mapDispatchToProps,
  // Unjustified type cast. FIXME
)(FieldDetailContainer as unknown as React.ComponentType);
