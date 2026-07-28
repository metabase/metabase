import cx from "classnames";
import { useEffect } from "react";
import { useMount, usePrevious } from "react-use";

import CS from "metabase/css/core/index.css";
import { connect, useSelector } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import * as actions from "metabase/reference/reference";
import SegmentRevisions from "metabase/reference/segments/SegmentRevisions";
import { useLocation, useParams } from "metabase/router";

import type { ClearStateProps, FetchProps } from "../reference";
import {
  type ReferenceRouteParams,
  getIsEditing,
  getSegment,
  getSegmentId,
  getUser,
} from "../selectors";

import SegmentSidebar from "./SegmentSidebar";

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

interface SegmentRevisionsContainerProps extends FetchProps, ClearStateProps {
  fetchSegments: (id?: number) => Promise<unknown>;
  fetchSegmentRevisions: (id: number) => Promise<unknown>;
  fetchSegmentTable: (id: number) => Promise<unknown>;
}

function SegmentRevisionsContainer(props: SegmentRevisionsContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const params = useParams<ReferenceRouteParams>();

  const user = useSelector(getUser);
  const segment = useSelector((state) => getSegment(state, { params }));
  const segmentId = useSelector((state) => getSegmentId(state, { params }));
  const isEditing = useSelector(getIsEditing);

  useMount(() => {
    actions.wrappedFetchSegmentRevisions(props, segmentId);
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
      sidebar={<SegmentSidebar segment={segment} user={user} />}
    >
      <SegmentRevisions params={params} />
    </SidebarLayout>
  );
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  null,
  mapDispatchToProps,
  // Unjustified type cast. FIXME
)(SegmentRevisionsContainer as unknown as React.ComponentType);
