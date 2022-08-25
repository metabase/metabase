/* eslint-disable react/prop-types */
import React from "react";
import PropTypes from "prop-types";
import DatabaseSchemasPane from "./DatabaseSchemasPane";
import DatabaseTablesPane from "./DatabaseTablesPane";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import Databases from "metabase/entities/databases";

class DatabasePaneInner extends React.Component {
  componentDidMount() {
    const { database } = this.props;
    if (database.schemas.length === 0) {
      database.fetchSchemas();
    }
  }

  componentDidUpdate(prevProps) {
    const { database } = this.props;
    if (database.id !== prevProps.database.id) {
      database.fetchSchemas();
    }
  }

  render() {
    const { schemas } = this.props.database;
    if (schemas.length === 0) {
      return <LoadingSpinner />;
    }
    const Component =
      schemas.length > 1 ? DatabaseSchemasPane : DatabaseTablesPane;
    return <Component {...this.props} />;
  }
}

const DatabasePane = Databases.load({
  id: (state, { database }) => database && database.id,
  wrapped: true,
})(DatabasePaneInner);

DatabasePane.propTypes = {
  show: PropTypes.func.isRequired,
  database: PropTypes.object.isRequired,
};

export default DatabasePane;
