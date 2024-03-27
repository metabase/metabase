import { useMemo } from "react";
import { ngettext, msgid } from "ttag";
import _ from "underscore";

import Search from "metabase/entities/search";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import type Database from "metabase-lib/v1/metadata/Database";
import type { SearchResult } from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
  NodeListItemLink,
  NodeListItemName,
  NodeListItemIcon,
  NodeListTitle,
  NodeListContainer,
  NodeListIcon,
  NodeListTitleText,
  QuestionId,
} from "./NodeList.styled";
import { PaneContent } from "./Pane.styled";

export interface DatabaseTablesPaneProps {
  onBack: () => void;
  onClose: () => void;
  onItemClick: (type: string, item: unknown) => void;
  database: Database;
  searchResults: SearchResult[];
}

export const DatabaseTablesPane = ({
  database,
  onItemClick,
  searchResults,
  onBack,
  onClose,
}: DatabaseTablesPaneProps) => {
  const tables = useMemo(
    () =>
      searchResults
        .filter(x => x.model === "table")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [searchResults],
  );
  const models = useMemo(
    () =>
      searchResults
        .filter(x => x.model === "dataset")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [searchResults],
  );
  return (
    <SidebarContent
      title={database.name}
      icon={"database"}
      onBack={onBack}
      onClose={onClose}
    >
      <PaneContent>
        <NodeListContainer>
          {models.length ? (
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
                      onClick={() => onItemClick("question", model)}
                    >
                      <NodeListItemIcon name="model" />
                      <NodeListItemName>{model.name}</NodeListItemName>
                      <QuestionId>{`#${model.id}`}</QuestionId>
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
                  disabled={table.initial_sync_status !== "complete"}
                  onClick={() => onItemClick("table", table)}
                >
                  <NodeListItemIcon name="table" />
                  <NodeListItemName
                    data-disabled={table.initial_sync_status !== "complete"}
                  >
                    {table.table_name}
                  </NodeListItemName>
                </NodeListItemLink>
              </li>
            ))}
          </ul>
        </NodeListContainer>
      </PaneContent>
    </SidebarContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Search.loadList({
    query: (_state: State, props: DatabaseTablesPaneProps) => ({
      models: ["dataset", "table"],
      table_db_id: props.database.id,
    }),
    listName: "searchResults",
  }),
)(DatabaseTablesPane);
