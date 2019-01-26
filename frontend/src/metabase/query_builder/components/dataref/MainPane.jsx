/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { t, ngettext, msgid } from "c-3po";
import { isQueryable } from "metabase/lib/table";
import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

const MainPane = ({ databases, show }) => (
  <div>
    <h2>{t`Data Reference`}</h2>
    <p>{t`Information about your tables and columns`}.</p>
    <ul>
      {databases &&
        databases
          .filter(db => db.tables && db.tables.length > 0)
          .map(database => (
            <li className="pt2" key={database.id}>
              <span className="flex align-center my2">
                <Icon name="database" className="text-light pr1" size={14} />
                <h3>{database.name}</h3>
              </span>
              <h4 className="text-medium border-bottom pb1">
                {(n => ngettext(msgid`${n} table`, `${n} tables`, n))(
                  database.tables.length,
                )}
              </h4>
              <ul className="mt1">
                {database.tables.filter(isQueryable).map((table, index) => (
                  <li
                    key={table.id}
                    className={cx("py1", {
                      "": index !== database.tables.length - 1,
                    })}
                  >
                    <a
                      className="text-brand no-decoration"
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
