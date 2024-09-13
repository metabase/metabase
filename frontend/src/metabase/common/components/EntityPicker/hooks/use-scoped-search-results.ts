import { useMemo } from "react";

import {
  skipToken,
  useGetDatabaseQuery,
  useListCollectionItemsQuery,
  useListDatabaseSchemaTablesQuery,
} from "metabase/api";
import { isNotNull } from "metabase/lib/types";
import type {
  CollectionId,
  CollectionItem,
  DatabaseId,
  SearchResult,
  SearchResultId,
  Table,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import type { EntityPickerSearchScope, TypeWithModel } from "../types";

export const useScopedSearchResults = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  searchQuery: string,
  searchModels: string[],
  searchScope: EntityPickerSearchScope,
  folder: Item | undefined,
): SearchResult[] | undefined => {
  const isScopedSearchEnabled = searchScope === "folder" && folder != null;

  const shouldUseCollectionItems =
    isScopedSearchEnabled && folder.model === "collection";
  const shouldUseTables = isScopedSearchEnabled && folder.model === "schema";

  const { data: collectionItemsData, isFetching: isFetchingCollectionItems } =
    useListCollectionItemsQuery(
      shouldUseCollectionItems ? { id: folder.id as CollectionId } : skipToken,
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

  const tableItems = useMemo(() => {
    return tablesToSearchResults(tables ?? [], database?.name);
  }, [tables, database]);

  const scopedSearchResults: SearchResult[] | undefined = useMemo(() => {
    if (!isScopedSearchEnabled) {
      return undefined;
    }

    if (shouldUseCollectionItems && !isFetchingCollectionItems) {
      return filterSearchResults(collectionItems, searchQuery, searchModels);
    }

    if (shouldUseTables && !isFetchingTables) {
      return filterSearchResults(tableItems, searchQuery, searchModels);
    }

    return [];
  }, [
    isFetchingTables,
    isFetchingCollectionItems,
    shouldUseCollectionItems,
    shouldUseTables,
    collectionItems,
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
): SearchResult[] => {
  return items.map(item => ({
    ...item,
    collection: folder,
  })) as unknown as SearchResult[];
};

const tablesToSearchResults = (
  tables: Table[],
  dbName: string | undefined,
): SearchResult[] => {
  return tables.map(table => ({
    ...table,
    model: "table",
    database_name: dbName,
    table_schema: table.schema,
  })) as unknown as SearchResult[];
};

const filterSearchResults = (
  results: SearchResult[],
  searchQuery: string,
  searchModels: string[],
) => {
  return results.filter(result => {
    const matchesQuery = result.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesModel = searchModels.includes(result.model);
    return matchesQuery && matchesModel;
  });
};

const isSchemaItem = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  item: Item,
): item is Item & { dbId: DatabaseId } => {
  return isObject(item) && "dbId" in item && typeof item.dbId === "number";
};
