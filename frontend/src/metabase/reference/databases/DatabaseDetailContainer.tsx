import cx from "classnames";
import type { Location } from "history";
import { Component } from "react";

import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import DatabaseDetail from "metabase/reference/databases/DatabaseDetail";
import * as actions from "metabase/reference/reference";

import type { ClearStateProps, FetchProps } from "../reference";
import type {
  ReferenceRouteParams,
  ReferenceRouteProps,
  StateWithReference,
} from "../selectors";
import { getDatabase, getDatabaseId, getIsEditing } from "../selectors";
import type { StubbedDatabase } from "../types";

import DatabaseSidebar from "./DatabaseSidebar";

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => ({
  database: getDatabase(state, props),
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state),
});

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

interface DatabaseDetailContainerProps extends FetchProps, ClearStateProps {
  // From React Router
  params: ReferenceRouteParams;
  location: Location;

  // From route definition / parent
  style: React.CSSProperties;

  // From mapStateToProps
  database: StubbedDatabase;
  databaseId: number;
  isEditing?: boolean;

  // From mapDispatchToProps (metadataActions spread)
  fetchDatabaseMetadata: (id: number) => Promise<unknown>;
}

class DatabaseDetailContainer extends Component<DatabaseDetailContainerProps> {
  fetchContainerData() {
    actions.wrappedFetchDatabaseMetadata(this.props, this.props.databaseId);
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps: DatabaseDetailContainerProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps);
  }

  render() {
    const { database, isEditing } = this.props;

    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<DatabaseSidebar database={database} />}
      >
        <DatabaseDetail {...this.props} />
      </SidebarLayout>
    );
  }
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(DatabaseDetailContainer as unknown as React.ComponentType);
