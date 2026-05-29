import cx from "classnames";
import type { Location } from "history";
import { Component } from "react";

import { cardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import type { Dispatch } from "metabase/redux/store";
import TableQuestions from "metabase/reference/databases/TableQuestions";
import * as actions from "metabase/reference/reference";

import type { ClearStateProps, FetchProps } from "../reference";
import type {
  ReferenceRouteParams,
  ReferenceRouteProps,
  StateWithReference,
} from "../selectors";
import {
  getDatabase,
  getDatabaseId,
  getIsEditing,
  getTable,
} from "../selectors";
import type { StubbedDatabase, StubbedTable } from "../types";

import TableSidebar from "./TableSidebar";

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => ({
  database: getDatabase(state, props),
  table: getTable(state, props),
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state),
});

const mapDispatchToProps = {
  fetchQuestions: () => (dispatch: Dispatch) =>
    runRtkEndpoint({}, dispatch, cardApi.endpoints.listCards),
  ...metadataActions,
  ...actions,
};

interface TableQuestionsContainerProps extends FetchProps, ClearStateProps {
  // From React Router
  params: ReferenceRouteParams;
  location: Location;

  // From route definition / parent
  style: React.CSSProperties;

  // From mapStateToProps
  database: StubbedDatabase;
  databaseId: number;
  table: StubbedTable;
  isEditing?: boolean;

  // From mapDispatchToProps
  fetchDatabaseMetadata: (id: number) => Promise<unknown>;
  fetchQuestions: () => Promise<unknown>;
}

class TableQuestionsContainer extends Component<TableQuestionsContainerProps> {
  fetchContainerData() {
    actions.wrappedFetchDatabaseMetadataAndQuestion(
      this.props,
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

    actions.clearState(newProps);
  }

  render() {
    const { database, table, isEditing } = this.props;

    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<TableSidebar database={database} table={table} />}
      >
        <TableQuestions {...this.props} />
      </SidebarLayout>
    );
  }
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(TableQuestionsContainer as unknown as React.ComponentType);
