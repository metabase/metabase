import React, { useMemo } from "react";
import { ngettext, msgid } from "ttag";
import _ from "underscore";

import Search from "metabase/entities/search";
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
  show: (type: string, item: any, name: string) => void;
  database: Database;
  searchResults: any[]; // TODO: /api/search is yet to be typed
}

const DatabaseTablesPane = ({
  show,
  searchResults,
}: DatabaseTablesPaneProps) => {
  const tables = useMemo(
    () =>
      searchResults
        ?.filter(x => x.model === "table")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [searchResults],
  );
  const models = useMemo(
    () =>
      searchResults
        ?.filter(x => x.model === "dataset")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [searchResults],
  );
  return searchResults ? (
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
                <NodeListItemLink
                  onClick={() => show("model", model, model.name)}
                >
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
            <NodeListItemLink
              onClick={() => show("table", table, table.table_name)}
            >
              <NodeListItemIcon name="table" />
              <NodeListItemName>{table.table_name}</NodeListItemName>
            </NodeListItemLink>
          </li>
        ))}
      </ul>
    </NodeListContainer>
  ) : null;
};

export default _.compose(
  Search.loadList({
    query: (_state: State, props: DatabaseTablesPaneProps) => ({
      models: ["dataset", "table"],
      table_db_id: props.database.id,
    }),
    loadingAndErrorWrapper: false,
    listName: "searchResults",
  }),
)(DatabaseTablesPane);
