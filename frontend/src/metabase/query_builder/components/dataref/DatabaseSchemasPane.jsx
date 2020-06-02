/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import Icon from "metabase/components/Icon";

const DatabaseSchemasPane = ({ database, show, ...props }) => {
  return (
    <div>
      <div className="ml1 my2 flex align-center justify-between border-bottom pb1">
        <div className="flex align-center">
          <Icon name="database" className="text-medium pr1" size={14} />
          <h3 className="text-wrap">{database.name}</h3>
        </div>
        <div className="flex align-center">
          <Icon name="folder" className="text-light pr1" size={12} />
          <span className="text-medium">{database.schemas.length}</span>
        </div>
      </div>

      <ul>
        {database.schemas.map(schema => (
          <li key={schema.id}>
            <a
              className="flex-full flex p1 text-bold text-brand text-wrap no-decoration bg-medium-hover"
              onClick={() => show("schema", schema)}
            >
              {schema.displayName()}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

DatabaseSchemasPane.propTypes = {
  show: PropTypes.func.isRequired,
  database: PropTypes.object.isRequired,
};

export default DatabaseSchemasPane;
