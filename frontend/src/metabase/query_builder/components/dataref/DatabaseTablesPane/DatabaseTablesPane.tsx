import React, { useMemo } from "react";
import { ngettext, msgid } from "ttag";
import _ from "underscore";

import Tables from "metabase/entities/tables";
import Questions from "metabase/entities/questions";
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
} from "../NodeList.styled";
import { ModelId } from "./DatabaseTablesPane.styled";

interface DatabaseTablesPaneProps {
  show: (type: string, item: unknown) => void;
  database: Database;
  models: Card[];
}

const DatabaseTablesPane = ({
  database,
  show,
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

export default _.compose(
  Tables.loadList({
    query: (_state: State, props: DatabaseTablesPaneProps) => ({
      dbId: props.database?.id,
    }),
    loadingAndErrorWrapper: false,
  }),
  Questions.loadList({
    query: (_state: State, props: DatabaseTablesPaneProps) => ({
      model: true,
      dbId: props.database?.id, // TODO: why could this be undefined?
    }),
    loadingAndErrorWrapper: false,
    listName: "models",
  }),
)(DatabaseTablesPane);
