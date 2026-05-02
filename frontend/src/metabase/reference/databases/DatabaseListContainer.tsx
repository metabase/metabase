import cx from "classnames";
import { Component } from "react";

import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import DatabaseList from "metabase/reference/databases/DatabaseList";
import BaseSidebar from "metabase/reference/guide/BaseSidebar";
import * as actions from "metabase/reference/reference";

import { getDatabaseId, getIsEditing } from "../selectors";

const mapStateToProps = (state: any, props: any) => ({
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state),
});

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

interface DatabaseListContainerProps {
  params: any;
  location: { pathname: string };

  database?: any;
  databaseId?: number;
}

class DatabaseListContainer extends Component<DatabaseListContainerProps> {
  async fetchContainerData() {
    await actions.wrappedFetchDatabases(this.props as any);
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps: DatabaseListContainerProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps as any);
  }

  render() {
    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        sidebar={<BaseSidebar />}
      >
        {}
        <DatabaseList {...(this.props as any)} />
      </SidebarLayout>
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(DatabaseListContainer as unknown as React.ComponentType);
