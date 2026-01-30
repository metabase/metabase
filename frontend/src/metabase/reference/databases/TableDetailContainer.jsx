/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";

import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/lib/redux";
import * as metadataActions from "metabase/redux/metadata";
import TableDetail from "metabase/reference/databases/TableDetail";
import * as actions from "metabase/reference/reference";

import {
  getDatabase,
  getDatabaseId,
  getIsEditing,
  getTable,
} from "../selectors";

import TableSidebar from "./TableSidebar";

const mapStateToProps = (state, props) => ({
  database: getDatabase(state, props),
  table: getTable(state, props),
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state, props),
});

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

class TableDetailContainer extends Component {
  static propTypes = {
    params: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    database: PropTypes.object.isRequired,
    databaseId: PropTypes.number.isRequired,
    table: PropTypes.object.isRequired,
    isEditing: PropTypes.bool,
  };

  async fetchContainerData() {
    await actions.wrappedFetchDatabaseMetadata(
      this.props,
      this.props.databaseId,
    );
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps) {
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
        <TableDetail {...this.props} />
      </SidebarLayout>
    );
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(TableDetailContainer);
