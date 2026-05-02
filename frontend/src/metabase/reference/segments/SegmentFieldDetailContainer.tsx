import cx from "classnames";
import { Component } from "react";

import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";
import SegmentFieldDetail from "metabase/reference/segments/SegmentFieldDetail";

import { getField, getIsEditing, getSegment, getSegmentId } from "../selectors";

import SegmentFieldSidebar from "./SegmentFieldSidebar";

const mapStateToProps = (state: any, props: any) => ({
  segment: getSegment(state, props),
  segmentId: getSegmentId(state, props),
  field: getField(state, props),
  isEditing: getIsEditing(state),
});

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

interface SegmentFieldDetailContainerProps {
  params: any;
  location: { pathname: string };
  databaseId: number;

  segment: any;
  segmentId: number;

  field: any;
  isEditing?: boolean;
}

class SegmentFieldDetailContainer extends Component<SegmentFieldDetailContainerProps> {
  async fetchContainerData() {
    await actions.wrappedFetchSegmentFields(
      this.props as any,
      this.props.segmentId,
    );
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps: SegmentFieldDetailContainerProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps as any);
  }

  render() {
    const { segment, field, isEditing } = this.props;

    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<SegmentFieldSidebar segment={segment} field={field} />}
      >
        {}
        <SegmentFieldDetail {...(this.props as any)} />
      </SidebarLayout>
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(SegmentFieldDetailContainer as unknown as React.ComponentType);
