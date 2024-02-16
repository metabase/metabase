/* eslint "react/prop-types": "warn" */
import PropTypes from "prop-types";
import _ from "underscore";

import Databases from "metabase/entities/databases";
import Schemas from "metabase/entities/schemas";

import DatabaseSchemasPane from "./DatabaseSchemasPane";
import DatabaseTablesPane from "./DatabaseTablesPane";

const DatabasePane = ({ database, ...props }) => {
  const Component =
    database.schemas.length > 1 ? DatabaseSchemasPane : DatabaseTablesPane;
  return <Component {...props} database={database} />;
};

DatabasePane.propTypes = {
  database: PropTypes.object.isRequired,
};

export default _.compose(
  Databases.load({
    id: (_state, { database }) => database.id,
  }),
  Schemas.loadList({
    query: (_state, { database }) => ({
      dbId: database.id,
    }),
  }),
)(DatabasePane);
