import React from "react";
import PropTypes from "prop-types";
import Icon from "metabase/components/Icon";
import Table from "metabase/entities/tables";

const DatabaseTablesPane = ({ database, show }) => {
  const tables = database.tables.sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div>
      <div className="ml1 my2 flex align-center justify-between border-bottom pb1">
        <div className="flex align-center">
          <Icon name="database" className="text-medium pr1" size={14} />
          <h3 className="text-wrap">{database.name}</h3>
        </div>
        <div className="flex align-center">
          <Icon name="table2" className="text-light pr1" size={12} />
          <span className="text-medium">{tables.length}</span>
        </div>
      </div>

      <ul>
        {tables.map(table => (
          <li key={table.id}>
            <a
              className="flex-full flex p1 text-bold text-brand text-wrap no-decoration bg-medium-hover"
              onClick={() => show("table", table)}
            >
              {table.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

DatabaseTablesPane.propTypes = {
  show: PropTypes.func.isRequired,
  database: PropTypes.object.isRequired,
};

export default Table.loadList({
  query: (_state, props) => ({
    dbId: props.database?.id,
  }),
})(DatabaseTablesPane);
