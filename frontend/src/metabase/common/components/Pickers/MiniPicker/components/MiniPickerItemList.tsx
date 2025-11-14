import { t } from "ttag";

import { skipToken, useListCollectionItemsQuery, useListDatabaseSchemaTablesQuery, useListDatabaseSchemasQuery, useListDatabasesQuery, useSearchQuery } from "metabase/api";
import { Box, Loader, Stack, Text } from "metabase/ui";
import type { CollectionId, SchemaName } from "metabase-types/api";

import { useMiniPickerContext } from "../context";
import type { MiniPickerDatabaseItem, MiniPickerSchemaItem } from "../types";

import { MiniPickerItem } from "./MiniPickerItem";

// gotta virtualize in here, sometimes there's 65k tables
export function MiniPickerItemList() {
  const { path, searchQuery } = useMiniPickerContext();

  if (searchQuery) {
    return (
      <SearchItemList query={searchQuery} />
    );
  }

  if (path.length === 0) {
    return <RootItemList />;
  }

  const lastParent = path[path.length - 1];

  if (lastParent.model === "database" || lastParent.model === "schema") {
    return <DatabaseItemList parent={lastParent} />;
  }

  if (lastParent.model === "collection") {
    return (
      <CollectionItemList parent={lastParent} />
    );
  }

  return (
    <Stack>{JSON.stringify(lastParent)}</Stack>
  );
}


function RootItemList() {
  const { data: databases } = useListDatabasesQuery();
  const { setPath } = useMiniPickerContext();

  return (
    <Stack gap="1px">
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
      ))}
      <MiniPickerItem
        name={t`Our analytics`}
        model="collection"
        isFolder
        onClick={() => {
          setPath([{
            model: "collection",
            id: 'root', // cmon typescript, trust me
            name: t`Our analytics`
          }]);
        }}
      />
    </Stack>
  );
}

function DatabaseItemList({
  parent
}: {
  parent: MiniPickerDatabaseItem | MiniPickerSchemaItem
}) {
  const { setPath, onChange } = useMiniPickerContext();
  const { data: schemas, isLoading: isLoadingSchemas } = useListDatabaseSchemasQuery(
    parent.model === "database" ? { id: parent.id } : skipToken
  );

  const schemaName: SchemaName | null = parent.model === "schema"
    ? String(parent.id)
    : schemas?.length === 1
      ? schemas[0] // if there's one schema, go straight to tables
      : null;

  const { data: tablesData } = useListDatabaseSchemaTablesQuery(
    schemaName !== null ? {
      id: (parent.dbId ?? parent.id) as number,
      schema: schemaName,
     } : skipToken
  );

  if (schemas?.length && schemas.length > 1 && parent.model === "database") {
    return (
      <Stack gap="1px">
        {schemas.map((schema) => (
          <MiniPickerItem
            key={schema}
            name={schema}
            isFolder
            model="schema"
            onClick={() => {
              setPath(prevPath => [
                ...prevPath,
                {
                  model: "schema",
                  id: schema,
                  dbId: parent.dbId ?? parent.id,
                  name: schema,
                },
              ]);
            }}
          />
        ))}
      </Stack>
    );
  }

  if (!isLoadingSchemas && tablesData?.length) {
    const tables = parent.model === "schema"
      ? tablesData.filter(table => table.schema === parent.id)
      : tablesData;

    return (
      <Stack gap="1px">
        {tables?.map((table) => (
          <MiniPickerItem
            key={table.id}
            name={table.display_name}
            model="table"
            onClick={() => {
              onChange({
                model: "table",
                id: table.id,
              });
            }}
          />
        ))}
      </Stack>
    );
  }
}

function CollectionItemList({
  parent
}: {
  parent: { model: "collection"; id: number | "root";
}}) {
  const { setPath, onChange, isFolder, isHidden} = useMiniPickerContext();

  const {data: items, isLoading } = useListCollectionItemsQuery({
    id: parent.id === null ? 'root' : parent.id,
  });

  if (!isLoading && items?.data?.length) {
    return (
      <Stack gap="1px">
        {items.data.map((item) => (
          <MiniPickerItem
            key={`${item.model}-${item.id}`}
            name={item.name}
            model={item.model}
            isFolder={isFolder(item)}
            isHidden={isHidden(item)}
            onClick={() => {
              if(isFolder(item)) {
                setPath(prevPath => [
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
                });
              }
            }}
          />
        ))}
      </Stack>
    );
  }
}

function SearchItemList({ query }: { query: string }) {
  const { onChange, isFolder, isHidden, models } = useMiniPickerContext();

  const { data: items, isLoading } = useSearchQuery({
    q: query,
    models,
  });

  return (
    <Stack gap="1px">
      <Box>
        {isLoading && <Loader />}
        {!isLoading && items?.data?.length === 0 && (
          <Text>{t`No search results`}</Text>
        )}
      </Box>
      {items?.data?.map((item) => (
        <MiniPickerItem
          key={`${item.model}-${item.id}`}
          name={item.display_name ?? item.name}
          model={item.model}
          isFolder={isFolder(item)}
          isHidden={isHidden(item)}
          onClick={() => {
              onChange({
                model: item.model,
                id: item.id,
              });
            }
          }
        />
      ))}
    </Stack>
  )
}
