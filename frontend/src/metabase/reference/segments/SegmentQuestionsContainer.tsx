import cx from "classnames";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import { cardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import CS from "metabase/css/core/index.css";
import { connect, useDispatch, useSelector } from "metabase/redux";
import type { Dispatch } from "metabase/redux/store";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import { fetchSegmentQuestionsData } from "metabase/reference/fetch-data";
import * as actions from "metabase/reference/reference";
import { SegmentQuestions } from "metabase/reference/segments/SegmentQuestions";
import { useReferenceFetch } from "metabase/reference/use-reference-fetch-state";
import { useLocation, useParams } from "metabase/router";

import type { ClearStateProps } from "../reference";
import {
  type ReferenceRouteParams,
  getIsEditing,
  getSegment,
  getSegmentId,
  getUser,
} from "../selectors";

import SegmentSidebar from "./SegmentSidebar";

const mapDispatchToProps = {
  fetchQuestions: () => (dispatch: Dispatch) =>
    runRtkEndpoint({}, dispatch, cardApi.endpoints.listCards),
  ...actions,
};

interface SegmentQuestionsContainerProps extends ClearStateProps {
  fetchQuestions: () => Promise<unknown>;
}

function SegmentQuestionsContainer(props: SegmentQuestionsContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const dispatch = useDispatch();
  const params = useParams<ReferenceRouteParams>();

  const user = useSelector(getUser);
  const segment = useSelector((state) => getSegment(state, { params }));
  const segmentId = useSelector((state) => getSegmentId(state, { params }));
  const isEditing = useSelector(getIsEditing);

  useReferenceFetch(() => fetchSegmentQuestionsData(dispatch, segmentId));

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
      <SegmentQuestions params={params} />
    </SidebarLayout>
  );
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  null,
  mapDispatchToProps,
  // Unjustified type cast. FIXME
)(SegmentQuestionsContainer as unknown as React.ComponentType);
