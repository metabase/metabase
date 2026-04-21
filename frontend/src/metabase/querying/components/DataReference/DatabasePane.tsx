import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useGetDatabaseQuery,
  useListDatabaseSchemasQuery,
  useSearchQuery,
} from "metabase/api";
import { getCollectionName } from "metabase/collections/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { Tree } from "metabase/common/components/tree";
import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
import CS from "metabase/css/core/index.css";
import {
  type Card,
  type CollectionId,
  type SchemaName,
  type SearchResult,
  type Table,
  isConcreteTableId,
} from "metabase-types/api";

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
import type {
  DataReferenceDatabaseItem,
  DataReferencePaneProps,
  OnItemClick,
} from "./types";

const groupModelsByCollection = (models: SearchResult[]) => {
  const grouped = _.groupBy(
    models,
    (model) => model.collection?.id ?? ("root" as CollectionId),
  );

  return _.pairs(grouped).map(
    ([id, models = []]): ITreeNodeItem => ({
      id: id as CollectionId,
      name: getCollectionName(models[0]?.collection),
      icon: "folder",
      children: models.map((model: SearchResult) => ({
        id: model.id,
        name: model.name,
        icon: "model",
        data: model,
      })),
    }),
  );
};

const groupTablesBySchema = (tables: SearchResult[]) => {
  const grouped = _.groupBy(
    tables,
    (table) => table.table_schema ?? ("" as SchemaName),
  );

  return _.pairs(grouped).map(
    ([id, tables = []]): ITreeNodeItem => ({
      id,
      name: id,
      icon: "folder_database",
      children: tables.map((table) => ({
        id: table.id,
        name: table.name,
        icon: "table",
        data: table,
      })),
    }),
  );
};

export type TablesListProps = {
  schemas: string[];
  tables: SearchResult[];
  onItemClick: OnItemClick;
};

const TablesList = ({ schemas, tables, onItemClick }: TablesListProps) => {
  const hasMultipleSchemas = schemas.length > 1;

  if (hasMultipleSchemas) {
    const tablesBySchema = groupTablesBySchema(tables).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return (
      <>
        <NodeListTitle>
          <NodeListIcon name="folder" />
          <NodeListTitleText>
            {t`${tables.length} ${ngettext(
              msgid`table`,
              `tables`,
              tables.length,
            )} in ${schemas.length} ${ngettext(
              msgid`schema`,
              `schemas`,
              schemas.length,
            )}`}
          </NodeListTitleText>
        </NodeListTitle>
        <Tree
          data={tablesBySchema}
          TreeNode={(props: TreeNodeProps<Table>) => (
            <ResourceTreeNode<Table>
              {...props}
              onItemClick={() => {
                const { id } = props.item.data ?? {};
                if (isConcreteTableId(id)) {
                  onItemClick({ type: "table", id });
                }
              }}
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
              onClick={() => {
                if (isConcreteTableId(table.id)) {
                  onItemClick({ type: "table", id: table.id });
                }
              }}
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

export type CollectionsListProps = {
  models: SearchResult[];
  onItemClick: OnItemClick;
};

const CollectionsList = ({ models, onItemClick }: CollectionsListProps) => {
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
        TreeNode={(props: TreeNodeProps<Card>) => (
          <ResourceTreeNode<Card>
            {...props}
            onItemClick={() => {
              if (props.item.data) {
                onItemClick({ type: "question", id: props.item.data.id });
              }
            }}
            displayId
          />
        )}
      />
    </>
  );
};

export type DatabasePaneProps =
  DataReferencePaneProps<DataReferenceDatabaseItem>;

export const DatabasePane = ({
  id: databaseId,
  onBack,
  onClose,
  onItemClick,
}: DatabasePaneProps) => {
  const {
    data: databaseData,
    isLoading: isLoadingDatabase,
    error: databaseError,
  } = useGetDatabaseQuery(databaseId != null ? { id: databaseId } : skipToken);

  const {
    data: schemasData,
    isLoading: isLoadingSchemas,
    error: schemasError,
  } = useListDatabaseSchemasQuery(
    databaseId != null ? { id: databaseId, "can-query": true } : skipToken,
  );

  const {
    data: searchResponse,
    isLoading: isLoadingSearch,
    error: searchError,
  } = useSearchQuery(
    databaseId != null
      ? {
          models: ["dataset", "table"],
          table_db_id: databaseId,
        }
      : skipToken,
  );

  const isLoading = isLoadingDatabase || isLoadingSchemas || isLoadingSearch;
  const error = databaseError || schemasError || searchError;

  const schemas = useMemo(() => schemasData ?? [], [schemasData]);
  const searchResults = useMemo(
    () => searchResponse?.data ?? [],
    [searchResponse],
  );

  const tables = useMemo(
    () =>
      searchResults
        .filter((searchResult) => searchResult.model === "table")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [searchResults],
  );
  const models = useMemo(
    () =>
      searchResults
        .filter((searchResult) => searchResult.model === "dataset")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [searchResults],
  );

  return (
    <LoadingAndErrorWrapper
      loading={isLoading}
      error={error}
      className={CS.fullHeight}
    >
      <SidebarContent
        title={databaseData?.name ?? "Untitled Database"}
        icon={"database"}
        onBack={onBack}
        onClose={onClose}
      >
        <SidebarContent.Pane>
          <NodeListContainer>
            <TablesList
              schemas={schemas}
              tables={tables}
              onItemClick={onItemClick}
            />
            <CollectionsList models={models} onItemClick={onItemClick} />
          </NodeListContainer>
        </SidebarContent.Pane>
      </SidebarContent>
    </LoadingAndErrorWrapper>
  );
};
