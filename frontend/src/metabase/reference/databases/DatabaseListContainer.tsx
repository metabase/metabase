import cx from "classnames";
import type { Location } from "history";
import { Component } from "react";

import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import DatabaseList from "metabase/reference/databases/DatabaseList";
import BaseSidebar from "metabase/reference/guide/BaseSidebar";
import * as actions from "metabase/reference/reference";

import type { ClearStateProps, FetchProps } from "../reference";
import type { ReferenceRouteProps, StateWithReference } from "../selectors";
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

interface DatabaseListContainerProps extends FetchProps, ClearStateProps {
  // From React Router
  location: Location;

  // From mapDispatchToProps (metadataActions spread)
  fetchRealDatabases: (args: unknown) => Promise<unknown>;
}

class DatabaseListContainer extends Component<DatabaseListContainerProps> {
  fetchContainerData() {
    actions.wrappedFetchDatabases(this.props);
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps: DatabaseListContainerProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps);
  }

  render() {
    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        sidebar={<BaseSidebar />}
      >
        <DatabaseList />
      </SidebarLayout>
    );
  }
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(DatabaseListContainer as unknown as React.ComponentType);
