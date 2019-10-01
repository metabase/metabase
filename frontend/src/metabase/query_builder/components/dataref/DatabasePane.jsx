/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { isQueryable } from "metabase/lib/table";
import Icon from "metabase/components/Icon";

function groupBySchema(tables) {
  const bySchema = {};
  for (const table of tables) {
    bySchema[table.schema] = [...(bySchema[table.schema] || []), table];
  }
  return bySchema;
}

const DatabasePane = ({ database, show, ...props }) => {
  const tablesBySchema = groupBySchema(database.tables.filter(isQueryable));
  return (
    <div>
      <div className="ml1 my2 flex align-center justify-between border-bottom pb1">
        <div className="flex align-center">
          <Icon name="database" className="text-medium pr1" size={14} />
          <h3 className="text-wrap">{database.name}</h3>
        </div>
        <div className="flex align-center">
          <Icon name="table2" className="text-light pr1" size={12} />
          <span className="text-medium">{database.tables.length}</span>
        </div>
      </div>

      {Object.entries(tablesBySchema).map(([schemaName, tables]) => (
        <div>
          {Object.keys(tablesBySchema).length > 1 && <span>{schemaName}</span>}
          <ul>
            {tables.map(table => (
              <li key={table.id}>
                <a
                  className="flex-full flex p1 text-bold text-brand text-wrap no-decoration bg-medium-hover"
                  onClick={() => show("table", table)}
                >
                  {table.display_name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

DatabasePane.propTypes = {
  show: PropTypes.func.isRequired,
  database: PropTypes.object.isRequired,
};

export default DatabasePane;
