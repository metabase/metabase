import cx from "classnames";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import { useListDatabasesQuery } from "metabase/api";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import DatabaseList from "metabase/reference/databases/DatabaseList";
import BaseSidebar from "metabase/reference/guide/BaseSidebar";
import * as actions from "metabase/reference/reference";
import { useReferenceFetchState } from "metabase/reference/use-reference-fetch-state";
import { useLocation } from "metabase/router";

import type { ClearStateProps, FetchProps } from "../reference";

const mapDispatchToProps = {
  ...actions,
};

interface DatabaseListContainerProps extends FetchProps, ClearStateProps {}

function DatabaseListContainer(props: DatabaseListContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);

  const { isFetching, error } = useListDatabasesQuery({ include: "tables" });
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
      sidebar={<BaseSidebar />}
    >
      <DatabaseList />
    </SidebarLayout>
  );
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  null,
  mapDispatchToProps,
  // Unjustified type cast. FIXME
)(DatabaseListContainer as unknown as React.ComponentType);
