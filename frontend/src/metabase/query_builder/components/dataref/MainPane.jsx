/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { t, ngettext, msgid } from "c-3po";
import { isQueryable } from "metabase/lib/table";

import cx from "classnames";

const MainPane = ({ databases, show }) => (
  <div>
    <h1>{t`Data Reference`}</h1>
    <p>
      {t`Learn more about your data structure to ask more useful questions`}.
    </p>
    <ul>
      {databases &&
        databases
          .filter(db => db.tables && db.tables.length > 0)
          .map(database => (
            <li key={database.id}>
              <div className="my2">
                <h2 className="inline-block">{database.name}</h2>
                <span className="ml1">
                  {(n => ngettext(msgid`${n} table`, `${n} tables`, n))(
                    database.tables.length,
                  )}
                </span>
              </div>
              <ul>
                {database.tables.filter(isQueryable).map((table, index) => (
                  <li
                    key={table.id}
                    className={cx("p1", {
                      "border-bottom": index !== database.tables.length - 1,
                    })}
                  >
                    <a
                      className="text-brand text-brand-darken-hover no-decoration"
                      onClick={() => show("table", table)}
                    >
                      {table.display_name}
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
