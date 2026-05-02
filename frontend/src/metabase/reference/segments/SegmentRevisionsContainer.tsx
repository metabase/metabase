import cx from "classnames";
import { Component } from "react";

import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";
import SegmentRevisions from "metabase/reference/segments/SegmentRevisions";

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
  ...metadataActions,
  ...actions,
};

interface SegmentRevisionsContainerProps {
  params: any;
  location: { pathname: string };
  databaseId: number;

  user: any;

  segment: any;
  segmentId: number;
  isEditing?: boolean;
}

class SegmentRevisionsContainer extends Component<SegmentRevisionsContainerProps> {
  async fetchContainerData() {
    await actions.wrappedFetchSegmentRevisions(
      this.props as any,
      this.props.segmentId,
    );
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps: SegmentRevisionsContainerProps) {
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
        <SegmentRevisions {...(this.props as any)} />
      </SidebarLayout>
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(SegmentRevisionsContainer as unknown as React.ComponentType);
