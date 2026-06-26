import { useEffect, useMemo, useState } from "react";
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
import { canCollectionCardBeUsed } from "metabase/common/components/Pickers/utils";
import { VirtualizedList } from "metabase/common/components/VirtualizedList";
import { useSetting } from "metabase/common/hooks";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { useGetIcon } from "metabase/hooks/use-icon";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { LibrarySubCollectionType } from "metabase/plugins/oss/library";
import { useSelector } from "metabase/redux";
import {
  Box,
  Ellipsified,
  Flex,
  Icon,
  Menu,
  Repeat,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import { isNamelessSchema } from "metabase-lib/v1/metadata/utils/schema";
import type {
  CollectionItem,
  SchemaName,
  SearchModel,
  SearchRequest,
} from "metabase-types/api";

import { type MiniPickerSearchParams, useMiniPickerContext } from "../context";
import type {
  MiniPickerCollectionItem,
  MiniPickerDatabaseItem,
  MiniPickerMeasureItem,
  MiniPickerPickableItem,
  MiniPickerSchemaItem,
  MiniPickerTableItem,
} from "../types";
import { getOurAnalytics } from "../utils";

import { MiniPickerItem } from "./MiniPickerItem";
import styles from "./MiniPickerItem.module.css";

export function MiniPickerItemList() {
  const { path, searchQuery, forceSearch } = useMiniPickerContext();

  if (searchQuery || forceSearch) {
    return <SearchItemList query={searchQuery ?? ""} />;
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
    if (libraryCollection.type === "library") {
      return <LibraryRootItemList libraryCollectionId={libraryCollection.id} />;
    }
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
      {!isHidden(getOurAnalytics()) && (
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
      )}
    </ItemList>
  );
}

/**
 * Shows the Data and Metrics sections at the library root.
 * If the user has access to the real root collections (is_library_root),
 * they render normally. If not, synthetic folders are created to group
 * any promoted subcollections by their type.
 */
function LibraryRootItemList({
  libraryCollectionId,
}: {
  libraryCollectionId: CollectionItem["id"];
}) {
  const { setPath } = useMiniPickerContext();

  const { data, isLoading } = useListCollectionItemsQuery({
    id: libraryCollectionId,
  });

  const sections = useMemo(() => {
    type Section = {
      key: string;
      name: string;
      type: LibrarySubCollectionType;
      realCollection?: CollectionItem;
      hasPromotedChildren: boolean;
    };

    const sectionDefs: Section[] = [
      {
        key: "data",
        name: t`Data`,
        type: "library-data",
        hasPromotedChildren: false,
      },
      {
        key: "metrics",
        name: t`Metrics`,
        type: "library-metrics",
        hasPromotedChildren: false,
      },
    ];

    const items = data?.data ?? [];

    for (const item of items) {
      if (item.model !== "collection") {
        continue;
      }

      for (const section of sectionDefs) {
        if (item.type !== section.type) {
          continue;
        }

        if (item.is_library_root) {
          section.realCollection = item;
        } else {
          section.hasPromotedChildren = true;
        }
      }
    }

    return sectionDefs.filter((s) => s.realCollection || s.hasPromotedChildren);
  }, [data]);

  if (isLoading) {
    return <MiniPickerListLoader />;
  }

  return (
    <ItemList>
      {sections.map((section) => {
        const collection = section.realCollection;

        return (
          <MiniPickerItem
            key={section.key}
            name={collection?.name ?? section.name}
            model="collection"
            isFolder
            onClick={() => {
              if (collection) {
                setPath([
                  {
                    model: "collection",
                    id: collection.id,
                    name: collection.name,
                    type: collection.type,
                  },
                ]);
              } else {
                setPath([
                  {
                    model: "collection",
                    id: `${section.type}-${libraryCollectionId}`,
                    sourceCollectionId: libraryCollectionId,
                    name: section.name,
                    type: section.type,
                    childTypeFilter: section.type,
                  },
                ]);
              }
            }}
          />
        );
      })}
    </ItemList>
  );
}

function DatabaseItemList({
  parent,
}: {
  parent: MiniPickerDatabaseItem | MiniPickerSchemaItem;
}) {
  const { setPath, onChange, isHidden, models, includeHiddenSchemas } =
    useMiniPickerContext();
  // Callers opt schemas in as a terminal pick by including "schema" in
  // `models`. Affects three things: schemas fire `onChange` instead of
  // `setPath`, single-schema DBs no longer auto-drill to tables, and the
  // schema row drops its folder chevron.
  const schemasArePickable = models.includes("schema");
  const { data: allSchemas, isLoading: isLoadingSchemas } =
    useListDatabaseSchemasQuery(
      parent.model === "database"
        ? {
            id: parent.id,
            "can-query": true,
            include_hidden: includeHiddenSchemas,
          }
        : skipToken,
    );

  const dbId = parent.model === "database" ? parent.id : parent.database_id!;

  const schemas = allSchemas?.filter((schema) => {
    return !isHidden({
      model: "schema",
      id: schema,
      database_id: dbId,
      name: schema,
    });
  });

  const schemaName: SchemaName | null =
    parent.model === "schema"
      ? String(parent.id)
      : !schemasArePickable && schemas?.length === 1
        ? schemas[0] // if there's one schema, go straight to tables
        : null;

  // Schema-less DBs (MySQL, Mongo, SQLite, …) report a single nameless schema.
  // In that case, select the DB immediately instead of showing a blank row at 'schema' step.
  const shouldAutoSelectNamelessSchema =
    schemasArePickable &&
    parent.model === "database" &&
    schemas?.length === 1 &&
    isNamelessSchema(schemas[0]);

  useEffect(() => {
    if (shouldAutoSelectNamelessSchema) {
      setPath([]);
      onChange({ model: "schema", id: "", database_id: dbId, name: "" });
    }
  }, [shouldAutoSelectNamelessSchema, onChange, setPath, dbId]);

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

  if (isLoadingSchemas || shouldAutoSelectNamelessSchema) {
    return <MiniPickerListLoader />;
  }

  if (
    schemas?.length &&
    parent.model === "database" &&
    (schemas.length > 1 || schemasArePickable)
  ) {
    return (
      <ItemList>
        {schemas.map((schema) => {
          const schemaItem: MiniPickerSchemaItem = {
            model: "schema",
            id: schema,
            database_id: dbId,
            name: schema,
          };
          return (
            <MiniPickerItem
              key={schema}
              name={schema}
              isFolder={!schemasArePickable}
              model="schema"
              onClick={() => {
                if (schemasArePickable) {
                  onChange(schemaItem);
                } else {
                  setPath((prevPath) => [...prevPath, schemaItem]);
                }
              }}
            />
          );
        })}
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
    id: parent.sourceCollectionId ?? (parent.id === null ? "root" : parent.id),
    include_can_run_adhoc_query: true,
  });

  const allItems: CollectionItem[] = (data?.data ?? []).filter(
    (item) => canCollectionCardBeUsed(item) && !isHidden(item),
  );
  const typeFilter = parent.childTypeFilter;
  const items = typeFilter
    ? allItems.filter(
        (item) => item.model !== "collection" || item.type === typeFilter,
      )
    : allItems;

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
                    type: item.type,
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

function SearchItemList({ query: externalQuery }: { query: string }) {
  const {
    onChange,
    models,
    isHidden,
    showSearchInput,
    searchInputPlaceholder,
    searchParams,
    onSearchResults,
  } = useMiniPickerContext();
  const [localQuery, setLocalQuery] = useState("");
  const query = showSearchInput ? localQuery : externalQuery;

  const debouncedQuery = useDebouncedValue(query, 500);

  const makeQueryArgs = (
    query: string,
    models: MiniPickerPickableItem["model"][],
    searchParams?: MiniPickerSearchParams,
  ): SearchRequest => {
    const params: SearchRequest = {
      q: query,
      models: models as SearchModel[],
      limit: 50,
      context: "data-picker",
    };
    const extraParams =
      typeof searchParams === "function" ? searchParams(params) : searchParams;

    return {
      ...params,
      // FIXME: optionally pass table_db_id so we filter on the backend to valid joins
      ...(extraParams || {}),
    };
  };

  const rawQueryArgs = useMemo(
    () => makeQueryArgs(query, models, searchParams),
    [query, models, searchParams],
  );

  const cachedSearch = useSelector(
    searchApi.endpoints.search.select(rawQueryArgs),
  );
  const hasCachedResults = Boolean(cachedSearch?.data);

  const effectiveQuery = hasCachedResults ? query : debouncedQuery;
  const searchQueryArgs = useMemo(
    () => makeQueryArgs(effectiveQuery, models, searchParams),
    [effectiveQuery, models, searchParams],
  );

  const { data: searchResponse, isFetching } = useSearchQuery(searchQueryArgs);

  const isSearching =
    isFetching || (!hasCachedResults && query !== debouncedQuery);

  const searchResults: MiniPickerPickableItem[] = useMemo(() => {
    return (searchResponse?.data ?? []).filter((i) => !isHidden(i));
  }, [searchResponse, isHidden]);

  useEffect(() => {
    onSearchResults?.(searchResults);
  }, [searchResults, onSearchResults]);

  return (
    <>
      {showSearchInput && (
        <>
          <TextInput
            placeholder={searchInputPlaceholder ?? t`Search…`}
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            autoFocus
            px="sm"
            pt="2px"
            pb="sm"
          />
          <Menu.Divider mx="sm" />
        </>
      )}
      <ItemList>
        {!isSearching && searchResults.length === 0 && (
          <Box>
            <Text
              px="md"
              py="sm"
              c="text-secondary"
            >{t`No search results`}</Text>
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
                classNames={{
                  itemLabel: styles.leftSection,
                  itemSection: styles.rightSection,
                }}
              />
            );
          })}
      </ItemList>
    </>
  );
}

export const MiniPickerListLoader = () => (
  <Stack
    data-testid="mini-picker-list-loader"
    px="1rem"
    pt="0.5rem"
    pb="13px"
    gap="1rem"
  >
    <Repeat times={3}>
      <Skeleton
        height="1.5rem"
        width="100%"
        radius="0.5rem"
        bg="background_page-secondary"
      />
    </Repeat>
  </Stack>
);

const ItemList = ({ children }: { children: React.ReactNode[] }) => {
  return <VirtualizedList extraPadding={2}>{children}</VirtualizedList>;
};

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

const isMeasure = (
  item: MiniPickerPickableItem,
): item is MiniPickerMeasureItem => {
  return item.model === "measure";
};

const isSchema = (
  item: MiniPickerPickableItem,
): item is MiniPickerSchemaItem => {
  return item.model === "schema";
};

const useLocationDetails = (item: MiniPickerPickableItem) => {
  const getIcon = useGetIcon();

  if (isTableInDb(item)) {
    return {
      itemText: `${item.database_name}${item.table_schema ? ` (${item.table_schema})` : ""}`,
      iconProps: null,
    };
  }
  if (isMeasure(item)) {
    return {
      itemText: item.table_display_name ?? item.table_name,
      iconProps: { name: "table" as const },
    };
  }
  if (isSchema(item)) {
    // Schemas don't appear in search results (see SearchableMiniPickerItem)
    // so this branch is defensive; surface the parent database id at most.
    return {
      itemText: String(item.database_id),
      iconProps: { name: "database" as const },
    };
  }
  return {
    itemText: item?.collection?.name ?? t`Our analytics`,
    iconProps: getIcon({ ...item.collection, model: "collection" }),
  };
};

const LocationInfo = ({ item }: { item: MiniPickerPickableItem }) => {
  const { itemText, iconProps } = useLocationDetails(item);

  if (!itemText) {
    return null;
  }

  return (
    <Flex gap="xs" align="center" ml="auto" style={{ overflow: "hidden" }}>
      {iconProps && <Icon {...iconProps} size={12} miw={12} />}
      <Text size="sm" c="text-secondary" miw="0">
        <Ellipsified>{itemText}</Ellipsified>
      </Text>
    </Flex>
  );
};
