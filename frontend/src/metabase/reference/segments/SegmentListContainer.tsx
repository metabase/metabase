import cx from "classnames";
import type { Location } from "history";
import { Component } from "react";

import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import BaseSidebar from "metabase/reference/guide/BaseSidebar";
import * as actions from "metabase/reference/reference";
import { SegmentList } from "metabase/reference/segments/SegmentList";

import type { ClearStateProps, FetchProps } from "../reference";
import type {
  ReferenceRouteParams,
  ReferenceRouteProps,
  StateWithReference,
} from "../selectors";
import { getDatabaseId, getIsEditing } from "../selectors";

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => ({
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state),
});

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

interface SegmentListContainerProps extends FetchProps, ClearStateProps {
  // From React Router
  params: ReferenceRouteParams;
  location: Location;

  // From route definition / parent
  style: React.CSSProperties;

  // From mapStateToProps
  isEditing?: boolean;

  // From mapDispatchToProps
  fetchSegments: (id?: number) => Promise<unknown>;
}

class SegmentListContainer extends Component<SegmentListContainerProps> {
  fetchContainerData() {
    actions.wrappedFetchSegments(this.props);
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps: SegmentListContainerProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps);
  }

  render() {
    const { isEditing } = this.props;

    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<BaseSidebar />}
      >
        <SegmentList {...this.props} />
      </SidebarLayout>
    );
  }
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(SegmentListContainer as unknown as React.ComponentType);
