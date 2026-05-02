import cx from "classnames";
import { Component } from "react";

import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import BaseSidebar from "metabase/reference/guide/BaseSidebar";
import * as actions from "metabase/reference/reference";
import { SegmentList } from "metabase/reference/segments/SegmentList";

import { getDatabaseId, getIsEditing } from "../selectors";

const mapStateToProps = (state: any, props: any) => ({
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state),
});

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

interface SegmentListContainerProps {
  params: any;
  location: { pathname: string };
  databaseId: number;
  isEditing?: boolean;
}

class SegmentListContainer extends Component<SegmentListContainerProps> {
  async fetchContainerData() {
    await actions.wrappedFetchSegments(this.props as any);
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps: SegmentListContainerProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps as any);
  }

  render() {
    const { isEditing } = this.props;

    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<BaseSidebar />}
      >
        {}
        <SegmentList {...(this.props as any)} />
      </SidebarLayout>
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(SegmentListContainer as unknown as React.ComponentType);
