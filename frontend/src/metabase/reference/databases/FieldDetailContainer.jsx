/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { connect } from "react-redux";

import SidebarLayout from "metabase/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import * as metadataActions from "metabase/redux/metadata";
import FieldDetail from "metabase/reference/databases/FieldDetail";
import * as actions from "metabase/reference/reference";
import { getMetadata } from "metabase/selectors/metadata";

import {
  getDatabase,
  getTable,
  getField,
  getDatabaseId,
  getIsEditing,
} from "../selectors";

import FieldSidebar from "./FieldSidebar";

const mapStateToProps = (state, props) => ({
  database: getDatabase(state, props),
  table: getTable(state, props),
  field: getField(state, props),
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state, props),
  metadata: getMetadata(state, props),
});

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

class FieldDetailContainer extends Component {
  static propTypes = {
    params: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    database: PropTypes.object.isRequired,
    databaseId: PropTypes.number.isRequired,
    table: PropTypes.object.isRequired,
    field: PropTypes.object.isRequired,
    isEditing: PropTypes.bool,
    metadata: PropTypes.object,
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
    const { database, table, field, isEditing } = this.props;

    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={
          <FieldSidebar database={database} table={table} field={field} />
        }
      >
        <FieldDetail {...this.props} />
      </SidebarLayout>
    );
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(FieldDetailContainer);
