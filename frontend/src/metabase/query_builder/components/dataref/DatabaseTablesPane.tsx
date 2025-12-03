import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { getCollectionName } from "metabase/collections/utils";
import { Tree } from "metabase/common/components/tree";
import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
import Search from "metabase/entities/search";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import type Database from "metabase-lib/v1/metadata/Database";
import type { CollectionId, SearchResult } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { CollectionTreeNode } from "./CollectionTreeNode";
import {
  NodeListContainer,
  NodeListIcon,
  NodeListItemIcon,
  NodeListItemLink,
  NodeListItemName,
  NodeListTitle,
  NodeListTitleText,
} from "./NodeList";

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
        .filter((x) => x.model === "table")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [searchResults],
  );
  const models = useMemo(
    () =>
      searchResults
        .filter((x) => x.model === "dataset")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [searchResults],
  );
  const modelsByCollection = useMemo(
    () =>
      Object.values(
        models.reduce(
          (acc, curr) => {
            const id = curr.collection?.id as CollectionId;
            const name = getCollectionName(curr.collection);

            if (!(id in acc)) {
              acc[id] = {
                id,
                name,
                icon: "folder",
                children: [],
              };
            }

            acc[id].children!.push({
              id: curr.id,
              name: curr.name,
              icon: "model",
            });

            return acc;
          },
          {} as Record<CollectionId, ITreeNodeItem>,
        ),
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [models],
  );

  return (
    <SidebarContent
      title={database.name}
      icon={"database"}
      onBack={onBack}
      onClose={onClose}
    >
      <SidebarContent.Pane>
        <NodeListContainer>
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
            {tables.map((table) => (
              <li key={table.id}>
                <NodeListItemLink
                  disabled={table.initial_sync_status !== "complete"}
                  onClick={() => onItemClick("table", table)}
                >
                  <NodeListItemIcon
                    disabled={table.initial_sync_status !== "complete"}
                    name="table"
                  />
                  <NodeListItemName
                    data-disabled={table.initial_sync_status !== "complete"}
                  >
                    {table.table_name}
                  </NodeListItemName>
                </NodeListItemLink>
              </li>
            ))}
          </ul>
          {modelsByCollection.length > 0 && (
            <>
              <NodeListTitle>
                <NodeListIcon name="model" />
                <NodeListTitleText>
                  {t`${models.length} ${ngettext(
                    msgid`model`,
                    `models`,
                    models.length,
                  )} in ${modelsByCollection.length} ${ngettext(
                    msgid`collection`,
                    `collections`,
                    modelsByCollection.length,
                  )}`}
                </NodeListTitleText>
              </NodeListTitle>
              <Tree
                data={modelsByCollection}
                TreeNode={(props: TreeNodeProps<ITreeNodeItem>) => (
                  <CollectionTreeNode
                    {...props}
                    onItemClick={() => onItemClick("question", props.item.data)}
                  />
                )}
              />
            </>
          )}
        </NodeListContainer>
      </SidebarContent.Pane>
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
