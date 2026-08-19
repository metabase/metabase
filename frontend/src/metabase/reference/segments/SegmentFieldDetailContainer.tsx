import cx from "classnames";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import CS from "metabase/css/core/index.css";
import { connect, useDispatch, useSelector } from "metabase/redux";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import { fetchSegmentFieldsData } from "metabase/reference/fetch-data";
import * as actions from "metabase/reference/reference";
import SegmentFieldDetail from "metabase/reference/segments/SegmentFieldDetail";
import { useReferenceFetch } from "metabase/reference/use-reference-fetch-state";
import { useLocation, useParams } from "metabase/router";

import type { ClearStateProps } from "../reference";
import {
  type ReferenceRouteParams,
  getField,
  getIsEditing,
  getSegment,
  getSegmentId,
} from "../selectors";

import SegmentFieldSidebar from "./SegmentFieldSidebar";

const mapDispatchToProps = {
  ...actions,
};

type SegmentFieldDetailContainerProps = ClearStateProps;

function SegmentFieldDetailContainer(props: SegmentFieldDetailContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const dispatch = useDispatch();
  const params = useParams<ReferenceRouteParams>();

  const segment = useSelector((state) => getSegment(state, { params }));
  const segmentId = useSelector((state) => getSegmentId(state, { params }));
  const field = useSelector((state) => getField(state, { params }));
  const isEditing = useSelector(getIsEditing);

  const { loading, loadingError } = useReferenceFetch(() =>
    fetchSegmentFieldsData(dispatch, segmentId),
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
      sidebar={<SegmentFieldSidebar segment={segment} field={field} />}
    >
      <SegmentFieldDetail
        params={params}
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
)(SegmentFieldDetailContainer as unknown as React.ComponentType);
