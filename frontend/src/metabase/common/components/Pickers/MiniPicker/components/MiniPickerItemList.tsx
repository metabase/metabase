import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  searchApi,
  skipToken,
  useGetCollectionQuery,
  useListCollectionItemsQuery,
  useListDatabaseSchemaTablesQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
  useSearchQuery,
} from "metabase/api";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { canCollectionCardBeUsed } from "metabase/common/components/Pickers/utils";
import { VirtualizedList } from "metabase/common/components/VirtualizedList";
import { useSetting } from "metabase/common/hooks";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { getIcon } from "metabase/lib/icon";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { Box, Flex, Icon, Repeat, Skeleton, Stack, Text } from "metabase/ui";
import type {
  CollectionItem,
  SchemaName,
  SearchModel,
  SearchRequest,
} from "metabase-types/api";

import { useMiniPickerContext } from "../context";
import type {
  MiniPickerCollectionItem,
  MiniPickerDatabaseItem,
  MiniPickerPickableItem,
  MiniPickerSchemaItem,
  MiniPickerTableItem,
} from "../types";

import { MiniPickerItem } from "./MiniPickerItem";

export function MiniPickerItemList() {
  const { path, searchQuery } = useMiniPickerContext();

  if (searchQuery) {
    return <SearchItemList query={searchQuery} />;
  }

  if (path.length === 0) {
    return <RootItemList />;
  }

  const lastParent = path[path.length - 1];

  if (lastParent.model === "database" || lastParent.model === "schema") {
    return <DatabaseItemList parent={lastParent} />;
  }

  if (lastParent.model === "collection") {
    return <CollectionItemList parent={lastParent} />;
  }

  return null;
}

function RootItemList() {
  const { data: databases } = useListDatabasesQuery({ "can-query": true });
  const { setPath, isHidden, models, shouldShowLibrary } =
    useMiniPickerContext();
  const { isLoading: isLoadingRootCollection, error: rootCollectionError } =
    useGetCollectionQuery({ id: "root" });
  const { data: libraryCollection, isLoading } =
    PLUGIN_LIBRARY.useGetResolvedLibraryCollection();
  const enableNestedQueries = useSetting("enable-nested-queries");

  if (isLoading || isLoadingRootCollection) {
    return <MiniPickerListLoader />;
  }

  const enabledDatabases = (databases?.data ?? []).filter(
    (db) => !isHidden({ model: "database", ...db }),
  );

  if (!enableNestedQueries) {
    return (
      <ItemList>
        {enabledDatabases.map((db) => (
          <MiniPickerItem
            key={db.id}
            name={db.name}
            model="database"
            isFolder
            onClick={() => {
              setPath([{ model: "database", id: db.id, name: db.name }]);
            }}
          />
        )) ?? []}
      </ItemList>
    );
  }

  if (
    libraryCollection &&
    _.intersection(models, [
      ...(libraryCollection.below || []),
      ...(libraryCollection.here || []),
    ]).length &&
    shouldShowLibrary
  ) {
    return (
      <CollectionItemList
        parent={{
          model: "collection",
          id: libraryCollection.id,
          name: libraryCollection.name,
        }}
      />
    );
  }

  return (
    <ItemList>
      {enabledDatabases.map((db) => (
        <MiniPickerItem
          key={db.id}
          name={db.name}
          model="database"
          isFolder
          onClick={() => {
            setPath([{ model: "database", id: db.id, name: db.name }]);
          }}
        />
      )) ?? <MiniPickerListLoader />}
      <MiniPickerItem
        name={rootCollectionError ? t`Collections` : t`Our analytics`}
        model="collection"
        isFolder
        onClick={() => {
          setPath([
            {
              model: "collection",
              id: "root" as any, // cmon typescript, trust me
              name: rootCollectionError ? t`Collections` : t`Our analytics`,
            },
          ]);
        }}
      />
    </ItemList>
  );
}

function DatabaseItemList({
  parent,
}: {
  parent: MiniPickerDatabaseItem | MiniPickerSchemaItem;
}) {
  const { setPath, onChange, isHidden } = useMiniPickerContext();
  const { data: allSchemas, isLoading: isLoadingSchemas } =
    useListDatabaseSchemasQuery(
      parent.model === "database"
        ? { id: parent.id, "can-query": true }
        : skipToken,
    );

  const dbId = parent.model === "database" ? parent.id : parent.dbId!;

  const schemas = allSchemas?.filter((schema) => {
    return !isHidden({
      model: "schema",
      id: schema,
      dbId,
      name: schema,
    });
  });

  const schemaName: SchemaName | null =
    parent.model === "schema"
      ? String(parent.id)
      : schemas?.length === 1
        ? schemas[0] // if there's one schema, go straight to tables
        : null;

  const { data: tablesData, isLoading: isLoadingTables } =
    useListDatabaseSchemaTablesQuery(
      schemaName !== null
        ? {
            id: dbId,
            schema: schemaName,
            "can-query": true,
          }
        : skipToken,
    );

  if (isLoadingSchemas) {
    return <MiniPickerListLoader />;
  }

  if (schemas?.length && schemas.length > 1 && parent.model === "database") {
    return (
      <ItemList>
        {schemas.map((schema) => (
          <MiniPickerItem
            key={schema}
            name={schema}
            isFolder
            model="schema"
            onClick={() => {
              setPath((prevPath) => [
                ...prevPath,
                {
                  model: "schema",
                  id: schema,
                  dbId,
                  name: schema,
                },
              ]);
            }}
          />
        ))}
      </ItemList>
    );
  }

  if (isLoadingTables) {
    return <MiniPickerListLoader />;
  }

  const nonHiddenTables = tablesData?.filter((table) => {
    return !isHidden({ model: "table", ...table });
  });

  if (!isLoadingSchemas && nonHiddenTables?.length) {
    const tables =
      parent.model === "schema"
        ? nonHiddenTables.filter((table) => table.schema === parent.id)
        : nonHiddenTables;

    return (
      <ItemList>
        {tables?.map((table) => (
          <MiniPickerItem
            key={table.id}
            name={table.display_name}
            model="table"
            onClick={() => {
              onChange({
                model: "table",
                id: table.id,
                db_id: table.db_id,
                name: table.display_name ?? table.name,
              });
            }}
          />
        ))}
      </ItemList>
    );
  }
}

function CollectionItemList({ parent }: { parent: MiniPickerCollectionItem }) {
  const { setPath, onChange, isFolder, isHidden } = useMiniPickerContext();

  const { data, isLoading, isFetching } = useListCollectionItemsQuery({
    id: parent.id === null ? "root" : parent.id,
    include_can_run_adhoc_query: true,
  });

  const allItems = data?.data?.filter(canCollectionCardBeUsed) ?? [];
  const items: CollectionItem[] = allItems.filter((item) => !isHidden(item));

  if (isLoading || isFetching) {
    return <MiniPickerListLoader />;
  }

  if (items?.length) {
    return (
      <ItemList>
        {items.map((item) => (
          <MiniPickerItem
            key={`${item.model}-${item.id}`}
            name={item.name}
            model={item.model}
            display={item.display}
            isFolder={isFolder(item)}
            onClick={() => {
              if (isFolder(item)) {
                setPath((prevPath) => [
                  ...prevPath,
                  {
                    model: item.model,
                    id: item.id,
                    name: item.name,
                  },
                ]);
              } else {
                onChange({
                  model: item.model,
                  id: item.id,
                  name: item.name,
                });
              }
            }}
          />
        ))}
      </ItemList>
    );
  }
}

function SearchItemList({ query }: { query: string }) {
  const { onChange, models, isHidden } = useMiniPickerContext();
  const debouncedQuery = useDebouncedValue(query, 500);

  const makeQueryArgs = (
    query: string,
    models: MiniPickerPickableItem["model"][],
  ): SearchRequest => ({
    q: query,
    models: models as SearchModel[],
    limit: 50,
    // FIXME: optionally pass table_db_id so we filter on the backend to valid joins
  });

  const rawQueryArgs = useMemo(
    () => makeQueryArgs(query, models),
    [query, models],
  );

  const cachedSearch = useSelector(
    searchApi.endpoints.search.select(rawQueryArgs),
  );
  const hasCachedResults = Boolean(cachedSearch?.data);

  const effectiveQuery = hasCachedResults ? query : debouncedQuery;
  const searchQueryArgs = useMemo(
    () => makeQueryArgs(effectiveQuery, models),
    [effectiveQuery, models],
  );

  const { data: searchResponse, isFetching } = useSearchQuery(searchQueryArgs);

  const isSearching =
    isFetching || (!hasCachedResults && query !== debouncedQuery);
  const searchResults: MiniPickerPickableItem[] = (
    searchResponse?.data ?? []
  ).filter((i) => !isHidden(i));

  return (
    <ItemList>
      {!isSearching && searchResults.length === 0 && (
        <Box>
          <Text px="md" py="sm" c="text-secondary">{t`No search results`}</Text>
        </Box>
      )}
      {isSearching && <MiniPickerListLoader />}
      {!isSearching &&
        searchResults.map((item) => {
          return (
            <MiniPickerItem
              key={`${item.model}-${item.id}`}
              name={item.name}
              model={item.model}
              onClick={() => {
                onChange(item);
              }}
              rightSection={<LocationInfo item={item} />}
            />
          );
        })}
    </ItemList>
  );
}

export const MiniPickerListLoader = () => (
  <Stack px="1rem" pt="0.5rem" pb="13px" gap="1rem">
    <Repeat times={3}>
      <Skeleton
        height="1.5rem"
        width="100%"
        radius="0.5rem"
        bg="background-secondary"
      />
    </Repeat>
  </Stack>
);

const isTableInDb = (
  item: MiniPickerPickableItem,
): item is MiniPickerTableItem => {
  // note: if you publish a table to Our analytics, we just can't figure that out
  return (
    item.model === "table" &&
    "collection" in item &&
    !!item.collection &&
    !item.collection.name
  );
};

const ItemList = ({ children }: { children: React.ReactNode[] }) => {
  return <VirtualizedList extraPadding={2}>{children}</VirtualizedList>;
};

const LocationInfo = ({ item }: { item: MiniPickerPickableItem }) => {
  const isTable = isTableInDb(item);

  const itemText = isTable
    ? `${item.database_name}${item.table_schema ? ` (${item.table_schema})` : ""}`
    : (item?.collection?.name ?? t`Our analytics`);

  if (!itemText) {
    return null;
  }

  const iconProps = isTable
    ? null
    : getIcon({
        ...item.collection,
        model: "collection",
      });

  return (
    <Flex gap="xs" align="center">
      {iconProps && <Icon {...iconProps} size={12} />}
      <Text size="sm" c="text-secondary">
        <Ellipsified maw="18rem">{itemText}</Ellipsified>
      </Text>
    </Flex>
  );
};
