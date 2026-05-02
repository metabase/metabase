import cx from "classnames";
import { Component } from "react";

import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";
import SegmentFieldList from "metabase/reference/segments/SegmentFieldList";

import {
  getIsEditing,
  getSegment,
  getSegmentId,
  getTable,
  getUser,
} from "../selectors";

import SegmentSidebar from "./SegmentSidebar";

const mapStateToProps = (state: any, props: any) => ({
  user: getUser(state),
  segment: getSegment(state, props),
  segmentId: getSegmentId(state, props),
  table: getTable(state, props),
  isEditing: getIsEditing(state),
});

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

interface SegmentFieldListContainerProps {
  params: any;
  location: { pathname: string };
  databaseId: number;

  user: any;

  segment: any;
  segmentId: number;
  isEditing?: boolean;
}

class SegmentFieldListContainer extends Component<SegmentFieldListContainerProps> {
  async fetchContainerData() {
    await actions.wrappedFetchSegmentFields(
      this.props as any,
      this.props.segmentId,
    );
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps: SegmentFieldListContainerProps) {
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
        <SegmentFieldList {...(this.props as any)} />
      </SidebarLayout>
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(SegmentFieldListContainer as unknown as React.ComponentType);
