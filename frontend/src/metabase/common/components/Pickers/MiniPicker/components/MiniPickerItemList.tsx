import { t } from "ttag";

import {
  skipToken,
  useListCollectionItemsQuery,
  useListDatabaseSchemaTablesQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
  useSearchQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { VirtualizedList } from "metabase/common/components/VirtualizedList";
import { Box, Stack, Text } from "metabase/ui";
import type { SchemaName, SearchModel } from "metabase-types/api";

import { useMiniPickerContext } from "../context";
import type {
  MiniPickerCollectionItem,
  MiniPickerDatabaseItem,
  MiniPickerPickableItem,
  MiniPickerSchemaItem,
} from "../types";
import { useGetLibraryCollection } from "../utils";

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

  return <Stack>{JSON.stringify(lastParent)}</Stack>;
}

function RootItemList() {
  const { data: databases } = useListDatabasesQuery();
  const { setPath } = useMiniPickerContext();
  // FIXME, should be an enterprise plugin
  const { data: libraryCollection, isLoading } = useGetLibraryCollection();

  if (isLoading) {
    return <MiniPickerListLoader />;
  }

  if (libraryCollection) {
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
      {databases?.data?.map((db) => (
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
        name={t`Our analytics`}
        model="collection"
        isFolder
        onClick={() => {
          setPath([
            {
              model: "collection",
              id: "root" as any, // cmon typescript, trust me
              name: t`Our analytics`,
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
  const { setPath, onChange } = useMiniPickerContext();
  const { data: schemas, isLoading: isLoadingSchemas } =
    useListDatabaseSchemasQuery(
      parent.model === "database" ? { id: parent.id } : skipToken,
    );

  const schemaName: SchemaName | null =
    parent.model === "schema"
      ? String(parent.id)
      : schemas?.length === 1
        ? schemas[0] // if there's one schema, go straight to tables
        : null;

  const dbId = parent.model === "database" ? parent.id : parent.dbId!;

  const { data: tablesData, isLoading: isLoadingTables } =
    useListDatabaseSchemaTablesQuery(
      schemaName !== null
        ? {
            id: dbId,
            schema: schemaName,
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

  if (!isLoadingSchemas && tablesData?.length) {
    const tables =
      parent.model === "schema"
        ? tablesData.filter((table) => table.schema === parent.id)
        : tablesData;

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

  const {
    data: items,
    isLoading,
    isFetching,
  } = useListCollectionItemsQuery({
    id: parent.id === null ? "root" : parent.id,
  });

  if (isLoading || isFetching) {
    return <MiniPickerListLoader />;
  }

  if (items?.data?.length) {
    return (
      <ItemList>
        {items.data.map((item) => (
          <MiniPickerItem
            key={`${item.model}-${item.id}`}
            name={item.name}
            model={item.model}
            isFolder={isFolder(item)}
            isHidden={isHidden(item)}
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
  const { onChange, models } = useMiniPickerContext();

  const { data: searchResponse, isLoading } = useSearchQuery({
    q: query,
    models: models as SearchModel[],
    limit: 50,
  });

  const searchResults = searchResponse?.data as
    | MiniPickerPickableItem[]
    | undefined;

  return (
    <ItemList>
      <Box>
        {isLoading && <MiniPickerListLoader />}
        {!isLoading && searchResults?.length === 0 && (
          <Text px="md" py="sm" c="text-medium">{t`No search results`}</Text>
        )}
      </Box>
      {searchResults?.map((item) => {
        return (
          <MiniPickerItem
            key={`${item.model}-${item.id}`}
            name={item.name}
            model={item.model}
            onClick={() => {
              onChange(item);
            }}
          />
        );
      })}
    </ItemList>
  );
}

export const MiniPickerListLoader = () => (
  <Box>
    <LoadingAndErrorWrapper loading />
  </Box>
);

const ItemList = ({ children }: { children: React.ReactNode[] }) => {
  return <VirtualizedList>{children}</VirtualizedList>;
};
