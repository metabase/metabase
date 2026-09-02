import cx from "classnames";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import CS from "metabase/css/core/index.css";
import { connect, useDispatch, useSelector } from "metabase/redux";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import { fetchSegmentListData } from "metabase/reference/fetch-data";
import BaseSidebar from "metabase/reference/guide/BaseSidebar";
import * as actions from "metabase/reference/reference";
import { SegmentList } from "metabase/reference/segments/SegmentList";
import { useReferenceFetch } from "metabase/reference/use-reference-fetch-state";
import { useLocation } from "metabase/router";

import type { ClearStateProps } from "../reference";
import { getIsEditing } from "../selectors";

const mapDispatchToProps = {
  ...actions,
};

type SegmentListContainerProps = ClearStateProps;

function SegmentListContainer(props: SegmentListContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);

  const dispatch = useDispatch();
  const isEditing = useSelector(getIsEditing);

  const { loading, loadingError } = useReferenceFetch(() =>
    fetchSegmentListData(dispatch),
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
      sidebar={<BaseSidebar />}
    >
      <SegmentList loading={loading} loadingError={loadingError} />
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
