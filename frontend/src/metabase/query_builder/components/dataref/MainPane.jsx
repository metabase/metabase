/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Icon from "metabase/components/Icon";

const MainPane = ({ databases, show }) => (
  <div>
    <p className="mt2 mb3 text-spaced">
      {t`Browse the contents of your databases, tables, and columns. Pick a database to get started.`}
    </p>
    <ul>
      {databases &&
        databases
          .filter(db => !db.is_saved_questions)
          .filter(db => db.tables && db.tables.length > 0)
          .map(database => (
            <li className="mb2" key={database.id}>
              <a
                onClick={() => show("database", database)}
                className="p1 flex align-center no-decoration bg-medium-hover"
              >
                <Icon name="database" className="pr1 text-medium" size={14} />
                <h3 className="text-wrap">{database.name}</h3>
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
