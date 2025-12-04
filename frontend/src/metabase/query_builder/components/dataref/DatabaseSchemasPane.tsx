import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import { getCollectionName } from "metabase/collections/utils";
import { Tree } from "metabase/common/components/tree/Tree";
import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
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
          name: getCollectionName({ id, name: curr.name }),
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
          icon: "model",
          data: curr,
        });

        return acc;
      },
      {} as Record<SchemaName, ITreeNodeItem>,
    ),
  );

interface DatabaseSchemasPaneProps {
  onBack: () => void;
  onClose: () => void;
  onItemClick: (type: string, item: unknown) => void;
  database: Database;
  models: SearchResult[];
}

const DatabaseSchemasPane = ({
  onBack,
  onClose,
  onItemClick,
  database,
  models: searchResults,
}: DatabaseSchemasPaneProps) => {
  const schemas = database.getSchemas();

  const tables = useMemo(
    () => searchResults.filter((model) => model.model === "table"),
    [searchResults],
  );
  const tablesBySchema = useMemo(
    () =>
      groupTablesBySchema(tables).sort((a, b) => a.name.localeCompare(b.name)),
    [tables],
  );

  const models = useMemo(
    () => searchResults.filter((model) => model.model === "dataset"),
    [searchResults],
  );
  const modelsByCollection = useMemo(
    () =>
      groupModelsByCollection(models).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
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
            <NodeListIcon name="folder" />
            <NodeListTitleText>
              {ngettext(
                msgid`${schemas.length} schema`,
                `${schemas.length} schemas`,
                schemas.length,
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
          {modelsByCollection.length ? (
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
                  />
                )}
              />
            </>
          ) : null}
        </NodeListContainer>
      </SidebarContent.Pane>
    </SidebarContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Search.loadList({
  query: (_state: State, props: DatabaseSchemasPaneProps) => ({
    models: ["dataset", "table"],
    table_db_id: props.database.id,
  }),
  listName: "models",
})(DatabaseSchemasPane);
