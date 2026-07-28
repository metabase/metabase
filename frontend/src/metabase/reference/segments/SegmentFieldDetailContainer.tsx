import cx from "classnames";
import { useEffect } from "react";
import { useMount, usePrevious } from "react-use";

import CS from "metabase/css/core/index.css";
import { connect, useSelector } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import * as actions from "metabase/reference/reference";
import SegmentFieldDetail from "metabase/reference/segments/SegmentFieldDetail";
import { useLocation, useParams } from "metabase/router";

import type { ClearStateProps, FetchProps } from "../reference";
import {
  type ReferenceRouteParams,
  getField,
  getIsEditing,
  getSegment,
  getSegmentId,
} from "../selectors";

import SegmentFieldSidebar from "./SegmentFieldSidebar";

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

interface SegmentFieldDetailContainerProps extends FetchProps, ClearStateProps {
  fetchSegments: (id?: number) => Promise<unknown>;
  fetchSegmentFields: (id: number) => Promise<unknown>;
  fetchSegmentTable: (id: number) => Promise<unknown>;
}

function SegmentFieldDetailContainer(props: SegmentFieldDetailContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const params = useParams<ReferenceRouteParams>();

  const segment = useSelector((state) => getSegment(state, { params }));
  const segmentId = useSelector((state) => getSegmentId(state, { params }));
  const field = useSelector((state) => getField(state, { params }));
  const isEditing = useSelector(getIsEditing);

  useMount(() => {
    actions.wrappedFetchSegmentFields(props, segmentId);
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
      sidebar={<SegmentFieldSidebar segment={segment} field={field} />}
    >
      <SegmentFieldDetail params={params} />
    </SidebarLayout>
  );
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  null,
  mapDispatchToProps,
  // Unjustified type cast. FIXME
)(SegmentFieldDetailContainer as unknown as React.ComponentType);
