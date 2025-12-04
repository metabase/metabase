import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import { getCollectionName } from "metabase/collections/utils";
import { Tree } from "metabase/common/components/tree";
import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
import Databases from "metabase/entities/databases";
import Schemas from "metabase/entities/schemas";
import Search from "metabase/entities/search";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  CollectionId,
  SchemaName,
  SearchResult,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
  NodeListContainer,
  NodeListIcon,
  NodeListItemIcon,
  NodeListItemLink,
  NodeListItemName,
  NodeListTitle,
  NodeListTitleText,
} from "./NodeList";
import { ResourceTreeNode } from "./ResourceTreeNode";

const groupModelsByCollection = (models: SearchResult[]) =>
  Object.values(
    models.reduce(
      (acc, curr) => {
        const id = curr.collection.id as CollectionId;

        acc[id] ??= {
          id,
          name: getCollectionName(curr.collection),
          icon: "folder",
          children: [] as ITreeNodeItem[],
        };

        acc[id].children!.push({
          id: curr.id,
          name: curr.name,
          icon: "model",
          data: curr,
        });

        return acc;
      },
      {} as Record<CollectionId, ITreeNodeItem>,
    ),
  );

const groupTablesBySchema = (tables: SearchResult[]) =>
  Object.values(
    tables.reduce(
      (acc, curr) => {
        const id = curr.table_schema as SchemaName;

        acc[id] ??= {
          id,
          name: id,
          icon: "folder_database",
          children: [] as ITreeNodeItem[],
        };

        acc[id].children!.push({
          id: curr.id,
          name: curr.name,
          icon: "table",
          data: curr,
        });

        return acc;
      },
      {} as Record<SchemaName, ITreeNodeItem>,
    ),
  );

export interface DatabasePaneProps {
  database: Database;
  searchResults: SearchResult[];
  onBack: () => void;
  onClose: () => void;
  onItemClick: (type: string, item: unknown) => void;
}

export const DatabasePane = ({
  database,
  searchResults,
  onBack,
  onClose,
  onItemClick,
}: DatabasePaneProps) => {
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

  const renderTables = () => {
    const hasMultipleSchemas = (database.schemas?.length ?? 0) > 1;

    if (hasMultipleSchemas) {
      const tablesBySchema = groupTablesBySchema(tables).sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      return (
        <>
          <NodeListTitle>
            <NodeListIcon name="folder" />
            <NodeListTitleText>
              {ngettext(
                msgid`${database.schemas?.length ?? 0} schema`,
                `${database.schemas?.length ?? 0} schemas`,
                database.schemas?.length ?? 0,
              )}
            </NodeListTitleText>
          </NodeListTitle>
          <Tree
            data={tablesBySchema}
            TreeNode={(props: TreeNodeProps<ITreeNodeItem>) => (
              <ResourceTreeNode
                {...props}
                onItemClick={() => onItemClick("table", props.item.data)}
              />
            )}
          />
        </>
      );
    }

    return (
      <>
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
      </>
    );
  };

  const renderCollections = () => {
    if (models.length === 0) {
      return null;
    }

    const modelsByCollection = groupModelsByCollection(models).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return (
      <>
        <NodeListTitle mt={16}>
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
            <ResourceTreeNode
              {...props}
              onItemClick={() => onItemClick("question", props.item.data)}
              displayId
            />
          )}
        />
      </>
    );
  };

  return (
    <SidebarContent
      title={database.name}
      icon={"database"}
      onBack={onBack}
      onClose={onClose}
    >
      <SidebarContent.Pane>
        <NodeListContainer>
          {renderTables()}
          {renderCollections()}
        </NodeListContainer>
      </SidebarContent.Pane>
    </SidebarContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Databases.load({
  id: (_state: State, props: DatabasePaneProps) => props.database.id,
})(
  Schemas.loadList({
    query: (_state: State, props: DatabasePaneProps) => ({
      dbId: props.database.id,
    }),
  })(
    Search.loadList({
      query: (_state: State, props: DatabasePaneProps) => ({
        models: ["dataset", "table"],
        table_db_id: props.database.id,
      }),
      listName: "searchResults",
    })(DatabasePane),
  ),
);
