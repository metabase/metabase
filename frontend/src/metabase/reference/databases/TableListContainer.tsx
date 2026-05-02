import cx from "classnames";
import { Component } from "react";

import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import TableList from "metabase/reference/databases/TableList";
import * as actions from "metabase/reference/reference";

import { getDatabase, getDatabaseId, getIsEditing } from "../selectors";

import DatabaseSidebar from "./DatabaseSidebar";

const mapStateToProps = (state: any, props: any) => ({
  database: getDatabase(state, props),
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state),
});

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

interface TableListContainerProps {
  params: any;
  location: { pathname: string };

  database: any;
  databaseId: number;
  isEditing?: boolean;
}

class TableListContainer extends Component<TableListContainerProps> {
  async fetchContainerData() {
    await actions.wrappedFetchDatabaseMetadata(
      this.props as any,
      this.props.databaseId,
    );
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps: TableListContainerProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps as any);
  }

  render() {
    const { database, isEditing } = this.props;

    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<DatabaseSidebar database={database} />}
      >
        {}
        <TableList {...(this.props as any)} />
      </SidebarLayout>
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(TableListContainer as unknown as React.ComponentType);
