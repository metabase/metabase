import cx from "classnames";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import { useGetDatabaseMetadataQuery } from "metabase/api";
import CS from "metabase/css/core/index.css";
import { connect, useSelector } from "metabase/redux";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import DatabaseDetail from "metabase/reference/databases/DatabaseDetail";
import * as actions from "metabase/reference/reference";
import { useReferenceFetchState } from "metabase/reference/use-reference-fetch-state";
import { useLocation, useParams } from "metabase/router";

import type { ClearStateProps, FetchProps } from "../reference";
import {
  type ReferenceRouteParams,
  getDatabase,
  getDatabaseId,
  getIsEditing,
} from "../selectors";

import DatabaseSidebar from "./DatabaseSidebar";

const mapDispatchToProps = {
  ...actions,
};

interface DatabaseDetailContainerProps extends FetchProps, ClearStateProps {}

function DatabaseDetailContainer(props: DatabaseDetailContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const params = useParams<ReferenceRouteParams>();

  const database = useSelector((state) => getDatabase(state, { params }));
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
      sidebar={<DatabaseSidebar database={database} />}
    >
      <DatabaseDetail params={params} />
    </SidebarLayout>
  );
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  null,
  mapDispatchToProps,
  // Unjustified type cast. FIXME
)(DatabaseDetailContainer as unknown as React.ComponentType);
