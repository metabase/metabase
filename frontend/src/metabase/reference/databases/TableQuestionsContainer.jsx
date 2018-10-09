/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import TableSidebar from "./TableSidebar.jsx";
import SidebarLayout from "metabase/components/SidebarLayout.jsx";

import TableQuestions from "metabase/reference/databases/TableQuestions.jsx";
import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";

import {
  getDatabase,
  getTable,
  getDatabaseId,
  getIsEditing,
} from "../selectors";

import Questions from "metabase/entities/questions";

const mapStateToProps = (state, props) => ({
  database: getDatabase(state, props),
  table: getTable(state, props),
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state, props),
});

const mapDispatchToProps = {
  fetchQuestions: Questions.actions.fetchList,
  ...metadataActions,
  ...actions,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class TableQuestionsContainer extends Component {
  static propTypes = {
    params: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    database: PropTypes.object.isRequired,
    databaseId: PropTypes.number.isRequired,
    table: PropTypes.object.isRequired,
    isEditing: PropTypes.bool,
  };

  async fetchContainerData() {
    await actions.wrappedFetchDatabaseMetadataAndQuestion(
      this.props,
      this.props.databaseId,
    );
  }

  componentWillMount() {
    this.fetchContainerData();
  }

  componentWillReceiveProps(newProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps);
  }

  render() {
    const { database, table, isEditing } = this.props;

    return (
      <SidebarLayout
        className="flex-full relative"
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<TableSidebar database={database} table={table} />}
      >
        <TableQuestions {...this.props} />
      </SidebarLayout>
    );
  }
}
