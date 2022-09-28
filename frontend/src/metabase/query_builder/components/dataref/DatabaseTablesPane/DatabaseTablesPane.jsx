import React from "react";
import { t, ngettext, msgid } from "ttag";
import _ from "underscore";
import PropTypes from "prop-types";

import Tables from "metabase/entities/tables";
import Questions from "metabase/entities/questions";
import {
  NodeListItem,
  NodeListItemName,
  NodeListItemIcon,
  NodeListTitle,
  NodeListContainer,
  NodeListIcon,
  NodeListTitleText,
} from "../NodeList.styled";
import { ModelId } from "./DatabaseTablesPane.styled";

const DatabaseTablesPane = ({ database, show, questions }) => {
  const tables = database.tables.sort((a, b) => a.name.localeCompare(b.name));
  const models = questions.sort((a, b) => a.name.localeCompare(b.name));
  return (
    <NodeListContainer>
      <NodeListTitle>
        <NodeListIcon name="model" />
        <NodeListTitleText>
          {ngettext(
            msgid`${models.length} model`,
            `${models.length} models`,
            models.length,
          )}
        </NodeListTitleText>
      </NodeListTitle>
      <ul>
        {models.map(model => (
          <NodeListItem key={model.id}>
            <a onClick={() => show("model", model)}>
              <NodeListItemIcon name="model" />
              <NodeListItemName>{model.name}</NodeListItemName>
              <ModelId>{t`#${model.id}`}</ModelId>
            </a>
          </NodeListItem>
        ))}
      </ul>
      <br></br>
      <NodeListTitle>
        <NodeListIcon name="table" />
        <NodeListTitleText>
          {ngettext(
            msgid`${tables.length} table`,
            `${tables.length} tables`,
            tables.length,
          )}
        </NodeListTitleText>
      </NodeListTitle>
      <ul>
        {tables.map(table => (
          <NodeListItem key={table.id}>
            <a onClick={() => show("table", table)}>
              <NodeListItemIcon name="table" />
              <NodeListItemName>{table.name}</NodeListItemName>
            </a>
          </NodeListItem>
        ))}
      </ul>
    </NodeListContainer>
  );
};

DatabaseTablesPane.propTypes = {
  show: PropTypes.func.isRequired,
  database: PropTypes.object.isRequired,
  questions: PropTypes.arrayOf(PropTypes.object),
};

export default _.compose(
  Tables.loadList({
    query: (_state, props) => ({
      dbId: props.database?.id,
    }),
  }),
  Questions.loadList({
    query: (_state, props) => ({
      f: "database-models",
      model_id: props.database?.id,
    }),
  }),
)(DatabaseTablesPane);
