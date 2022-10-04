/* eslint "react/prop-types": "warn" */
import React, { useMemo } from "react";
import { ngettext, msgid } from "ttag";

import Search from "metabase/entities/search";
import type { Card } from "metabase-types/api";
import type { State } from "metabase-types/store";
import Database from "metabase-lib/lib/metadata/Database";
import {
  NodeListItemLink,
  NodeListItemName,
  NodeListItemIcon,
  NodeListTitle,
  NodeListContainer,
  NodeListIcon,
  NodeListTitleText,
  ModelId,
} from "./NodeList.styled";

interface DatabaseSchemasPaneProps {
  show: (type: string, item: unknown) => void;
  database: Database;
  models: Card[];
}

const DatabaseSchemasPane = ({
  database,
  show,
  models,
}: DatabaseSchemasPaneProps) => {
  const sortedModels = useMemo(
    () => models?.sort((a, b) => a.name.localeCompare(b.name)),
    [models],
  );
  const schemas = database.schemas;
  return sortedModels ? (
    <NodeListContainer>
      {sortedModels?.length ? (
        <>
          <NodeListTitle>
            <NodeListIcon name="model" />
            <NodeListTitleText>
              {ngettext(
                msgid`${sortedModels.length} model`,
                `${sortedModels.length} models`,
                sortedModels.length,
              )}
            </NodeListTitleText>
          </NodeListTitle>
          <ul>
            {sortedModels.map(model => (
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
        <NodeListIcon name="folder" />
        <NodeListTitleText>
          {ngettext(
            msgid`${schemas.length} schema`,
            `${schemas.length} schemas`,
            schemas.length,
          )}
        </NodeListTitleText>
      </NodeListTitle>
      <ul>
        {schemas.map(schema => (
          <li key={schema.id}>
            <NodeListItemLink onClick={() => show("schema", schema)}>
              <NodeListItemIcon name="folder" />
              <NodeListItemName>{schema.name}</NodeListItemName>
            </NodeListItemLink>
          </li>
        ))}
      </ul>
    </NodeListContainer>
  ) : null;
};

export default Search.loadList({
  query: (_state: State, props: DatabaseSchemasPaneProps) => ({
    models: "dataset",
    table_db_id: props.database.id,
  }),
  loadingAndErrorWrapper: false,
  listName: "models",
})(DatabaseSchemasPane);
