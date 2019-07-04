/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { isQueryable } from "metabase/lib/table";
import Icon from "metabase/components/Icon.jsx";

const DatabasePane = ({ database, show, ...props }) => (
  <div>
    <div className="ml1 my2 flex align-center justify-between border-bottom pb1">
      <div className="flex align-center">
        <Icon name="database" className="text-medium pr1" size={14} />
        <h3>{database.name}</h3>
      </div>
      <div className="flex align-center">
        <Icon name="table2" className="text-light pr1" size={12} />
        <span className="text-medium">{database.tables.length}</span>
      </div>
    </div>

    <ul>
      {database.tables.filter(isQueryable).map((table, index) => (
        <li key={table.id}>
          <a
            className="flex-full flex p1 text-bold text-brand no-decoration bg-medium-hover"
            onClick={() => show("table", table)}
          >
            {table.name}
          </a>
        </li>
      ))}
    </ul>
  </div>
);

DatabasePane.propTypes = {
  show: PropTypes.func.isRequired,
  database: PropTypes.object.isRequired,
};

export default DatabasePane;
