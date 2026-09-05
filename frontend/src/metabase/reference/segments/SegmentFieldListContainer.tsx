import cx from "classnames";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import CS from "metabase/css/core/index.css";
import { connect, useDispatch, useSelector } from "metabase/redux";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import { fetchSegmentFieldsData } from "metabase/reference/fetch-data";
import * as actions from "metabase/reference/reference";
import SegmentFieldList from "metabase/reference/segments/SegmentFieldList";
import { useReferenceFetch } from "metabase/reference/use-reference-fetch-state";
import { useLocation, useParams } from "metabase/router";

import type { ClearStateProps } from "../reference";
import {
  type ReferenceRouteParams,
  getIsEditing,
  getSegment,
  getSegmentId,
  getTable,
  getUser,
} from "../selectors";

import SegmentSidebar from "./SegmentSidebar";

const mapDispatchToProps = {
  ...actions,
};

type SegmentFieldListContainerProps = ClearStateProps;

function SegmentFieldListContainer(props: SegmentFieldListContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const dispatch = useDispatch();
  const params = useParams<ReferenceRouteParams>();

  const user = useSelector(getUser);
  const segment = useSelector((state) => getSegment(state, { params }));
  const segmentId = useSelector((state) => getSegmentId(state, { params }));
  const isEditing = useSelector(getIsEditing);
  // `SegmentFieldList` reads `table.db_id` but doesn't select the table itself.
  const table = useSelector((state) => getTable(state, { params }));

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
      sidebar={<SegmentSidebar segment={segment} user={user} />}
    >
      <SegmentFieldList
        params={params}
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
)(SegmentFieldListContainer as unknown as React.ComponentType);
