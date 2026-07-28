import cx from "classnames";
import { useEffect } from "react";
import { useMount, usePrevious } from "react-use";

import CS from "metabase/css/core/index.css";
import { connect, useSelector } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import BaseSidebar from "metabase/reference/guide/BaseSidebar";
import * as actions from "metabase/reference/reference";
import { SegmentList } from "metabase/reference/segments/SegmentList";
import { useLocation } from "metabase/router";

import type { ClearStateProps, FetchProps } from "../reference";
import { getIsEditing } from "../selectors";

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

interface SegmentListContainerProps extends FetchProps, ClearStateProps {
  fetchSegments: (id?: number) => Promise<unknown>;
}

function SegmentListContainer(props: SegmentListContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);

  const isEditing = useSelector(getIsEditing);

  useMount(() => {
    actions.wrappedFetchSegments(props);
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
      sidebar={<BaseSidebar />}
    >
      <SegmentList />
    </SidebarLayout>
  );
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  null,
  mapDispatchToProps,
  // Unjustified type cast. FIXME
)(SegmentListContainer as unknown as React.ComponentType);
