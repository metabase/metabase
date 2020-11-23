/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import Icon from "metabase/components/Icon";

class DatabaseTablesPane extends Component {
  componentDidMount() {
    const { database } = this.props;
    if (database.tables.length === 0) {
      // FIXME: this also fetches fields
      database.fetchDatabaseMetadata();
    }
  }

  componentDidUpdate(prevProps) {
    const { database } = this.props;
    if (database.id !== prevProps.database.id) {
      // FIXME: this also fetches fields
      database.fetchDatabaseMetadata();
    }
  }

  render() {
    const { database, show } = this.props;
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
  }
}

DatabaseTablesPane.propTypes = {
  show: PropTypes.func.isRequired,
  database: PropTypes.object.isRequired,
};

export default DatabaseTablesPane;
