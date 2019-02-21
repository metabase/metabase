/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import Icon from "metabase/components/Icon.jsx";

const MainPane = ({ databases, show }) => (
  <div>
    <div className="ml1 mt2 mb3">
      <h2>{t`Data Reference`}</h2>
      <p className="text-spaced">
        {t`Browse the contents of your databases, tables, and columns. Pick a database to get started`}.
      </p>
    </div>
    <ul>
      {databases &&
        databases
          .filter(db => db.tables && db.tables.length > 0)
          .map(database => (
            <li className="mb2" key={database.id}>
              <a
                onClick={() => show("database", database)}
                className="p1 flex align-center no-decoration bg-medium-hover"
              >
                <Icon name="database" className="pr1 text-medium" size={14} />
                <h3>{database.name}</h3>
              </a>
            </li>
          ))}
    </ul>
  </div>
);

MainPane.propTypes = {
  show: PropTypes.func.isRequired,
  databases: PropTypes.array,
};

export default MainPane;
