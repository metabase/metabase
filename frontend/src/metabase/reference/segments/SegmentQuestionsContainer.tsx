import cx from "classnames";
import { Component } from "react";

import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { Questions } from "metabase/entities/questions";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";
import { SegmentQuestions } from "metabase/reference/segments/SegmentQuestions";

import {
  getDatabaseId,
  getIsEditing,
  getSegment,
  getSegmentId,
  getUser,
} from "../selectors";

import SegmentSidebar from "./SegmentSidebar";

const mapStateToProps = (state: any, props: any) => ({
  user: getUser(state),
  segment: getSegment(state, props),
  segmentId: getSegmentId(state, props),
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state),
});

const mapDispatchToProps = {
  fetchQuestions: Questions.actions.fetchList,
  ...metadataActions,
  ...actions,
};

interface SegmentQuestionsContainerProps {
  params: any;
  location: { pathname: string };
  databaseId: number;

  user: any;

  segment: any;
  segmentId: number;
  isEditing?: boolean;
}

class SegmentQuestionsContainer extends Component<SegmentQuestionsContainerProps> {
  async fetchContainerData() {
    await actions.wrappedFetchSegmentQuestions(
      this.props as any,
      this.props.segmentId,
    );
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps: SegmentQuestionsContainerProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps as any);
  }

  render() {
    const { user, segment, isEditing } = this.props;

    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<SegmentSidebar segment={segment} user={user} />}
      >
        {}
        <SegmentQuestions {...(this.props as any)} />
      </SidebarLayout>
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(SegmentQuestionsContainer as unknown as React.ComponentType);
