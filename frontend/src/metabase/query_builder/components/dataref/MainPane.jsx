/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import { isQueryable } from "metabase/lib/table";
import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

const MainPane = ({ databases, show }) => (
  <div>
    <div className="ml1 mt2">
      <h2>{t`Data Reference`}</h2>
      <p>{t`Information about your tables and columns`}.</p>
    </div>
    <ul>
      {databases &&
        databases
          .filter(db => db.tables && db.tables.length > 0)
          .map(database => (
            <li className="pt1" key={database.id}>
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
                  <li
                    key={table.id}
                    className={cx("", {
                      "": index !== database.tables.length - 1,
                    })}
                  >
                    <a
                      className="flex-full flex p1 text-bold text-brand no-decoration bg-medium-hover"
                      onClick={() => show("table", table)}
                    >
                      {table.name}
                    </a>
                  </li>
                ))}
              </ul>
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
