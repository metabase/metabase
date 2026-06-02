import cx from "classnames";
import type { Location } from "history";
import { Component } from "react";

import { cardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import type { Dispatch } from "metabase/redux/store";
import * as actions from "metabase/reference/reference";
import { SegmentQuestions } from "metabase/reference/segments/SegmentQuestions";
import type { User } from "metabase-types/api";

import type { ClearStateProps, FetchProps } from "../reference";
import type {
  ReferenceRouteParams,
  ReferenceRouteProps,
  StateWithReference,
} from "../selectors";
import { getIsEditing, getSegment, getSegmentId, getUser } from "../selectors";
import type { StubbedSegment } from "../types";

import SegmentSidebar from "./SegmentSidebar";

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => ({
  user: getUser(state),
  segment: getSegment(state, props),
  segmentId: getSegmentId(state, props),
  isEditing: getIsEditing(state),
});

const mapDispatchToProps = {
  fetchQuestions: () => (dispatch: Dispatch) =>
    runRtkEndpoint({}, dispatch, cardApi.endpoints.listCards),
  ...metadataActions,
  ...actions,
};

interface SegmentQuestionsContainerProps extends FetchProps, ClearStateProps {
  // From React Router
  params: ReferenceRouteParams;
  location: Location;

  // From route definition / parent
  style: React.CSSProperties;

  // From mapStateToProps
  user: User | null;
  segment: StubbedSegment;
  segmentId: number;
  isEditing?: boolean;

  // From mapDispatchToProps
  fetchSegments: (id?: number) => Promise<unknown>;
  fetchSegmentTable: (id: number) => Promise<unknown>;
  fetchQuestions: () => Promise<unknown>;
}

class SegmentQuestionsContainer extends Component<SegmentQuestionsContainerProps> {
  fetchContainerData() {
    actions.wrappedFetchSegmentQuestions(this.props, this.props.segmentId);
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps: SegmentQuestionsContainerProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps);
  }

  render() {
    const { user, segment, isEditing } = this.props;

    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<SegmentSidebar segment={segment} user={user} />}
      >
        <SegmentQuestions {...this.props} />
      </SidebarLayout>
    );
  }
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(SegmentQuestionsContainer as unknown as React.ComponentType);
