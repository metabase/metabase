import cx from "classnames";
import { Component } from "react";

import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { Questions } from "metabase/entities/questions";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import TableQuestions from "metabase/reference/databases/TableQuestions";
import * as actions from "metabase/reference/reference";

import {
  getDatabase,
  getDatabaseId,
  getIsEditing,
  getTable,
} from "../selectors";

import TableSidebar from "./TableSidebar";

const mapStateToProps = (state: any, props: any) => ({
  database: getDatabase(state, props),
  table: getTable(state, props),
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state),
});

const mapDispatchToProps = {
  fetchQuestions: Questions.actions.fetchList,
  ...metadataActions,
  ...actions,
};

interface TableQuestionsContainerProps {
  params: any;
  location: { pathname: string };

  database: any;
  databaseId: number;

  table: any;
  isEditing?: boolean;
}

class TableQuestionsContainer extends Component<TableQuestionsContainerProps> {
  async fetchContainerData() {
    await actions.wrappedFetchDatabaseMetadataAndQuestion(
      this.props as any,
      this.props.databaseId,
    );
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps: TableQuestionsContainerProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps as any);
  }

  render() {
    const { database, table, isEditing } = this.props;

    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<TableSidebar database={database} table={table} />}
      >
        {}
        <TableQuestions {...(this.props as any)} />
      </SidebarLayout>
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(TableQuestionsContainer as unknown as React.ComponentType);
