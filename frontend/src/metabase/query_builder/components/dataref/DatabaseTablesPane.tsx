import React, { useMemo } from "react";
import { ngettext, msgid } from "ttag";
import _ from "underscore";

import Tables from "metabase/entities/tables";
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

interface DatabaseTablesPaneProps {
  onItemClick: (type: string, item: unknown) => void;
  database: Database;
  models: Card[];
}

const DatabaseTablesPane = ({
  database,
  onItemClick,
  models,
}: DatabaseTablesPaneProps) => {
  const tables = useMemo(
    () => database.tables.sort((a, b) => a.name.localeCompare(b.name)),
    [database.tables],
  );
  const sortedModels = useMemo(
    () => models?.sort((a, b) => a.name.localeCompare(b.name)),
    [models],
  );
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
                <NodeListItemLink onClick={() => onItemClick("model", model)}>
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
            <NodeListItemLink onClick={() => onItemClick("table", table)}>
              <NodeListItemIcon name="table" />
              <NodeListItemName>{table.name}</NodeListItemName>
            </NodeListItemLink>
          </li>
        ))}
      </ul>
    </NodeListContainer>
  ) : null;
};

export default _.compose(
  Tables.loadList({
    query: (_state: State, props: DatabaseTablesPaneProps) => ({
      dbId: props.database.id,
    }),
    loadingAndErrorWrapper: false,
  }),
  Search.loadList({
    query: (_state: State, props: DatabaseTablesPaneProps) => ({
      models: "dataset",
      table_db_id: props.database.id,
    }),
    loadingAndErrorWrapper: false,
    listName: "models",
  }),
)(DatabaseTablesPane);
