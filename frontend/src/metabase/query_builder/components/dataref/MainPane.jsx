/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Databases from "metabase/entities/databases";

import {
  NodeListItemLink,
  NodeListItemName,
  NodeListItemIcon,
} from "./NodeList.styled";

const MainPane = ({ databases, onItemClick }) => (
  <div>
    <p className="mt2 mb3 text-spaced">
      {t`Browse the contents of your databases, tables, and columns. Pick a database to get started.`}
    </p>
    <ul>
      {databases &&
        databases
          .filter(db => !db.is_saved_questions)
          .map(database => (
            <li key={database.id}>
              <NodeListItemLink
                onClick={() => onItemClick("database", database)}
              >
                <NodeListItemIcon name="database" />
                <NodeListItemName>{database.name}</NodeListItemName>
              </NodeListItemLink>
            </li>
          ))}
    </ul>
  </div>
);

MainPane.propTypes = {
  onItemClick: PropTypes.func.isRequired,
  databases: PropTypes.array,
};

export default Databases.loadList()(MainPane);
