import cx from "classnames";
import { useEffect } from "react";
import { useMount, usePrevious } from "react-use";

import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import DatabaseList from "metabase/reference/databases/DatabaseList";
import BaseSidebar from "metabase/reference/guide/BaseSidebar";
import * as actions from "metabase/reference/reference";
import { useLocation } from "metabase/router";

import type { ClearStateProps, FetchProps } from "../reference";

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

interface DatabaseListContainerProps extends FetchProps, ClearStateProps {
  fetchRealDatabases: (args: unknown) => Promise<unknown>;
}

function DatabaseListContainer(props: DatabaseListContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);

  useMount(() => {
    actions.wrappedFetchDatabases(props);
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
