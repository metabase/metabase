/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import DatabaseSchemasPane from "./DatabaseSchemasPane";
import DatabaseTablesPane from "./DatabaseTablesPane";

const DatabasePane = props => {
  const Component =
    props.database.schemas.length > 1
      ? DatabaseSchemasPane
      : DatabaseTablesPane;
  return <Component {...props} />;
};

DatabasePane.propTypes = {
  show: PropTypes.func.isRequired,
  database: PropTypes.object.isRequired,
};

export default DatabasePane;
