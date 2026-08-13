import cx from "classnames";
import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";

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

  // Dispatched during render, not from an effect, to reproduce the
  // `UNSAFE_componentWillMount` this replaced: the child reads `loading` from
  // the store, so it has to be true before the child's first render. From an
  // effect (even `useLayoutEffect`) the tree commits once with no data, and the
  // reference header lays out wrong — see DEV-2430.
  const didFetch = useRef(false);
  if (!didFetch.current) {
    didFetch.current = true;
    actions.wrappedFetchSegmentRevisions(props, segmentId);
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
