/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";
import PropTypes from "prop-types";
import Databases from "metabase/entities/databases";
import Schemas from "metabase/entities/schemas";
import DatabaseSchemasPane from "./DatabaseSchemasPane";
import DatabaseTablesPane from "./DatabaseTablesPane";

const DatabasePaneInner = ({ database, ...props }) => {
  const Component =
    database.schemas.length > 1 ? DatabaseSchemasPane : DatabaseTablesPane;
  return <Component {...props} database={database} />;
};

const DatabasePane = _.compose(
  Databases.load({
    id: (_state, { database }) => database.id,
  }),
  Schemas.loadList({
    query: (_state, { database }) => ({
      dbId: database.id,
    }),
  }),
)(DatabasePaneInner);

DatabasePane.propTypes = {
  onItemClick: PropTypes.func.isRequired,
  database: PropTypes.object.isRequired,
};

export default DatabasePane;
