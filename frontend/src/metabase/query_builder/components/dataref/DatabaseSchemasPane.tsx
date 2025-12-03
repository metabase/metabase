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
import type { Card, CollectionId } from "metabase-types/api";
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

interface DatabaseSchemasPaneProps {
  onBack: () => void;
  onClose: () => void;
  onItemClick: (type: string, item: unknown) => void;
  database: Database;
  models: Card[];
}

const DatabaseSchemasPane = ({
  onBack,
  onClose,
  onItemClick,
  database,
  models,
}: DatabaseSchemasPaneProps) => {
  const modelsByCollection = useMemo(
    () =>
      Object.values(
        models.reduce(
          (acc, curr) => {
            const id = curr.collection_id as CollectionId;
            const name = getCollectionName({ id, name: curr.name });

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
              data: curr,
            });

            return acc;
          },
          {} as Record<CollectionId, ITreeNodeItem>,
        ),
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [models],
  );
  const schemas = database.getSchemas();
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
          <ul>
            {schemas.map((schema) => (
              <li key={schema.id}>
                <NodeListItemLink onClick={() => onItemClick("schema", schema)}>
                  <NodeListItemIcon name="folder" />
                  <NodeListItemName>{schema.name}</NodeListItemName>
                </NodeListItemLink>
              </li>
            ))}
          </ul>
          {modelsByCollection.length ? (
            <>
              <br></br>
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
          ) : null}
        </NodeListContainer>
      </SidebarContent.Pane>
    </SidebarContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Search.loadList({
  query: (_state: State, props: DatabaseSchemasPaneProps) => ({
    models: ["dataset"],
    table_db_id: props.database.id,
  }),
  listName: "models",
})(DatabaseSchemasPane);
