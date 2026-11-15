import cx from "classnames";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import CS from "metabase/css/core/index.css";
import { connect, useDispatch, useSelector } from "metabase/redux";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import { fetchSegmentDetailData } from "metabase/reference/fetch-data";
import * as actions from "metabase/reference/reference";
import SegmentDetail from "metabase/reference/segments/SegmentDetail";
import { useReferenceFetch } from "metabase/reference/use-reference-fetch-state";
import { useLocation, useParams } from "metabase/router";

import type { ClearStateProps } from "../reference";
import {
  type ReferenceRouteParams,
  getIsEditing,
  getSegmentId,
  getUser,
} from "../selectors";

import SegmentSidebar from "./SegmentSidebar";
import { useSegmentPage } from "./use-segment-page";

const mapDispatchToProps = {
  ...actions,
};

type SegmentDetailContainerProps = ClearStateProps;

function SegmentDetailContainer(props: SegmentDetailContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const dispatch = useDispatch();
  const params = useParams<ReferenceRouteParams>();

  const user = useSelector(getUser);
  const segmentId = useSelector((state) => getSegmentId(state, { params }));
  const isEditing = useSelector(getIsEditing);
  const { segment, table } = useSegmentPage(segmentId);

  const { loading, loadingError } = useReferenceFetch(() =>
    fetchSegmentDetailData(dispatch, segmentId),
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
        <SegmentSidebar
          segmentId={segmentId}
          segmentName={segment?.name}
          user={user}
        />
      }
    >
      <SegmentDetail
        params={params}
        segment={segment}
        table={table}
        loading={loading}
        loadingError={loadingError}
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
)(SegmentDetailContainer as unknown as React.ComponentType);
