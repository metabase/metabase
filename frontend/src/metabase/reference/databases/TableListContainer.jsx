/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import DatabaseSidebar from "./DatabaseSidebar.jsx";
import SidebarLayout from "metabase/components/SidebarLayout.jsx";
import TableList from "metabase/reference/databases/TableList.jsx";

import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";

@entityObjectLoader({
  entityType: "databases",
  entityId: (state, props) => props.params.databaseId,
})
export default class TableListContainer extends Component {
  static propTypes = {
    params: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
  };

  render() {
    const { params, object } = this.props;
    return (
      <SidebarLayout
        className="flex-full relative"
        sidebar={<DatabaseSidebar database={object} />}
      >
        <TableList database={object} {...this.props} />
      </SidebarLayout>
    );
  }
}
