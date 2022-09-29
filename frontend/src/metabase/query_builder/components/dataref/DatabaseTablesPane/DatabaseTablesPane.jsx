import React, { useMemo } from "react";
import { ngettext, msgid } from "ttag";
import _ from "underscore";
import PropTypes from "prop-types";

import Tables from "metabase/entities/tables";
import Questions from "metabase/entities/questions";
import {
  NodeListItemLink,
  NodeListItemName,
  NodeListItemIcon,
  NodeListTitle,
  NodeListContainer,
  NodeListIcon,
  NodeListTitleText,
} from "../NodeList.styled";
import { ModelId } from "./DatabaseTablesPane.styled";

const DatabaseTablesPane = ({ database, show, models }) => {
  const tables = useMemo(
    () => database.tables.sort((a, b) => a.name.localeCompare(b.name)),
    [database.tables],
  );
  models = useMemo(
    () => models?.sort((a, b) => a.name.localeCompare(b.name)),
    [models],
  );
  return models ? (
    <NodeListContainer>
      {models?.length ? (
        <>
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
              <li key={model.id}>
                <NodeListItemLink onClick={() => show("model", model)}>
                  <NodeListItemIcon name="model" />
                  <NodeListItemName>{model.name}</NodeListItemName>
                  <ModelId>{`#${model.id}`}</ModelId>
                </NodeListItemLink>
              </li>
            ))}
          </ul>
          <br></br>
        </>
      ) : null}
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
          <li key={table.id}>
            <NodeListItemLink onClick={() => show("table", table)}>
              <NodeListItemIcon name="table" />
              <NodeListItemName>{table.name}</NodeListItemName>
            </NodeListItemLink>
          </li>
        ))}
      </ul>
    </NodeListContainer>
  ) : null;
};

DatabaseTablesPane.propTypes = {
  show: PropTypes.func.isRequired,
  database: PropTypes.object.isRequired,
  models: PropTypes.arrayOf(PropTypes.object),
};

export default _.compose(
  Tables.loadList({
    query: (_state, props) => ({
      dbId: props.database?.id,
    }),
    loadingAndErrorWrapper: false,
  }),
  Questions.loadList({
    query: (_state, props) => ({
      model: true,
      dbId: props.database?.id, // TODO: why could this be undefined?
    }),
    loadingAndErrorWrapper: false,
    listName: "models",
  }),
)(DatabaseTablesPane);
