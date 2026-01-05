import { useMemo } from "react";

import {
  skipToken,
  useGetDatabaseQuery,
  useListCollectionItemsQuery,
  useListDashboardItemsQuery,
  useListDatabaseSchemaTablesQuery,
} from "metabase/api";
import { DATABASES_COLLECTION } from "metabase/entities/collections";
import { isNotNull } from "metabase/lib/types";
import type {
  CollectionId,
  CollectionItem,
  CollectionItemModel,
  DashboardId,
  SearchResultId,
  Table,
} from "metabase-types/api";

import type {
  EntityPickerSearchScope,
  SearchItem,
  TypeWithModel,
} from "../types";
import { isSchemaItem } from "../utils";

const searchModelsToCollectionItemModels = (
  searchModels: string[],
): CollectionItemModel[] => {
  const validModels = [
    "card",
    "collection",
    "dataset",
    "dashboard",
    "snippet",
    "metric",
  ] as const;
  return validModels.filter((model) => searchModels.includes(model));
};

export const useScopedSearchResults = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  searchQuery: string,
  searchModels: string[],
  searchScope: EntityPickerSearchScope,
  folder: Item | undefined,
): SearchItem[] | null => {
  const isScopedSearchEnabled =
    searchScope === "folder" && folder != null && folder.id !== "tenant";

  const shouldUseCollectionItems =
    isScopedSearchEnabled &&
    folder.model === "collection" &&
    folder.id !== DATABASES_COLLECTION.id;
  const shouldUseDashboardItems =
    isScopedSearchEnabled && folder.model === "dashboard";

  const shouldUseTables = isScopedSearchEnabled && folder.model === "schema";

  const { data: collectionItemsData, isFetching: isFetchingCollectionItems } =
    useListCollectionItemsQuery(
      shouldUseCollectionItems && searchQuery
        ? {
            id: folder.id as CollectionId,
            models: searchModelsToCollectionItemModels(searchModels),
          }
        : skipToken,
    );

  const { data: dashboardItemsData, isFetching: isFetchingDashboardItems } =
    useListDashboardItemsQuery(
      shouldUseDashboardItems && searchQuery
        ? { id: folder.id as DashboardId }
        : skipToken,
    );

  const dbId =
    shouldUseTables && isSchemaItem(folder) ? folder.dbId : undefined;
  const schemaName =
    shouldUseTables && isSchemaItem(folder) ? folder.id : undefined;

  const { data: tables, isFetching: isFetchingTables } =
    useListDatabaseSchemaTablesQuery(
      shouldUseTables && isNotNull(dbId) && isNotNull(schemaName)
        ? { id: dbId, schema: schemaName as string }
        : skipToken,
    );

  const { data: database } = useGetDatabaseQuery(
    shouldUseTables && isNotNull(dbId) ? { id: dbId } : skipToken,
  );

  const collectionItems = useMemo(() => {
    return collectionItemsToSearchResults(
      collectionItemsData?.data ?? [],
      folder,
    );
  }, [collectionItemsData, folder]);

  const dashboardItems = useMemo(() => {
    return collectionItemsToSearchResults(
      dashboardItemsData?.data ?? [],
      folder,
    );
  }, [dashboardItemsData, folder]);

  const tableItems = useMemo(() => {
    return tablesToSearchResults(tables ?? [], database?.name);
  }, [tables, database]);

  const scopedSearchResults: SearchItem[] | null = useMemo(() => {
    if (isScopedSearchEnabled && shouldUseCollectionItems) {
      return isFetchingCollectionItems
        ? null
        : filterSearchResults(collectionItems, searchQuery, searchModels);
    }

    if (isScopedSearchEnabled && shouldUseDashboardItems) {
      return isFetchingDashboardItems
        ? null
        : filterSearchResults(dashboardItems, searchQuery, searchModels);
    }

    if (isScopedSearchEnabled && shouldUseTables) {
      return isFetchingTables
        ? null
        : filterSearchResults(tableItems, searchQuery, searchModels);
    }

    return null;
  }, [
    isFetchingTables,
    isFetchingCollectionItems,
    isFetchingDashboardItems,
    shouldUseCollectionItems,
    shouldUseDashboardItems,
    shouldUseTables,
    collectionItems,
    dashboardItems,
    tableItems,
    searchQuery,
    searchModels,
    isScopedSearchEnabled,
  ]);

  return scopedSearchResults;
};

const collectionItemsToSearchResults = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  items: CollectionItem[],
  folder: Item | undefined,
): SearchItem[] => {
  return items.reduce((items: SearchItem[], item) => {
    if (item.model !== "snippet") {
      items.push({
        ...item,
        model: item.model,
        collection: folder && { ...folder, id: Number(folder.id) },
        database_name: null,
        display: null,
        table_schema: null,
        moderated_status: null,
        collection_authority_level: null,
      });
    }
    return items;
  }, []);
};

const tablesToSearchResults = (
  tables: Table[],
  dbName: string | undefined,
): SearchItem[] => {
  return tables.map((table) => ({
    ...table,
    id: Number(table.id),
    name: table.display_name,
    model: "table",
    database_name: dbName ?? null,
    table_schema: table.schema,
    display: null,
    moderated_status: null,
    collection_authority_level: null,
  }));
};

const filterSearchResults = (
  results: SearchItem[],
  searchQuery: string,
  searchModels: string[],
) => {
  return results.filter((result) => {
    const matchesQuery = result.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesModel = searchModels.includes(result.model);
    return matchesQuery && matchesModel;
  });
};
