/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Databases from "metabase/entities/databases";

import {
  FieldListItem,
  FieldListItemName,
  FieldListItemIcon,
} from "./FieldList/FieldList.styled";

const MainPane = ({ databases, show }) => (
  <div>
    <p className="mt2 mb3 text-spaced">
      {t`Browse the contents of your databases, tables, and columns. Pick a database to get started.`}
    </p>
    <ul>
      {databases &&
        databases
          .filter(db => !db.is_saved_questions)
          .map(database => (
            <FieldListItem key={database.id}>
              <a onClick={() => show("database", database)}>
                <FieldListItemIcon name="database" />
                <FieldListItemName>{database.name}</FieldListItemName>
              </a>
            </FieldListItem>
          ))}
    </ul>
  </div>
);

MainPane.propTypes = {
  show: PropTypes.func.isRequired,
  databases: PropTypes.array,
};

export default Databases.loadList()(MainPane);
