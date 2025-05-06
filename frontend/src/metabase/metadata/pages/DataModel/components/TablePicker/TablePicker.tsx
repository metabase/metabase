import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import {
  skipToken,
  useListDatabaseSchemaTablesQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
  useSearchQuery,
} from "metabase/api";
import EmptyState from "metabase/components/EmptyState";
import { useDispatch } from "metabase/lib/redux";
import { Box, Icon, Input } from "metabase/ui";
import type {
  Database,
  DatabaseId,
  SchemaId,
  SearchResponse,
  TableId,
} from "metabase-types/api";

import { getUrl } from "../../utils";

import { Delay, LoadingNode, Node } from "./Node";
import { useExpandedState, usePrefetch } from "./utils";

export function TablePicker(props: {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
}) {
  const [searchValue, setSearchValue] = useState("");

  return (
    <>
      <Input
        value={searchValue}
        onChange={(evt) => setSearchValue(evt.target.value)}
        placeholder={t`Search tables, fields…`}
        leftSection={<Icon name="search" />}
      />
      {searchValue === "" ? (
        <RootNode {...props} />
      ) : (
        <SearchResults searchValue={searchValue} />
      )}
    </>
  );
}

function RootNode({
  databaseId,
  schemaId,
}: {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
}) {
  const { data, isLoading, isError } = useListDatabasesQuery();

  usePrefetch({ databaseId, schemaId });

  const dispatch = useDispatch();
  const { expanded, toggle } = useExpandedState(databaseId);

  if (isError) {
    throw new Error("Failed to load databases");
  }

  if (isLoading) {
    return (
      <Delay>
        <LoadingNode type="database" />
        <LoadingNode type="database" />
        <LoadingNode type="database" />
      </Delay>
    );
  }

  const toggleDatabase = (databaseId: DatabaseId) => {
    if (!expanded[databaseId]) {
      dispatch(
        push(
          getUrl({
            databaseId,
            schemaId: undefined,
            tableId: undefined,
            fieldId: undefined,
          }),
        ),
      );
    }
    toggle(databaseId);
  };

  return data?.data?.map((database) => (
    <DatabaseNode
      key={database.id}
      database={database}
      expanded={expanded[database.id]}
      onToggle={() => toggleDatabase(database.id)}
      initialSchema={database.id === databaseId ? schemaId : undefined}
    />
  ));
}

function DatabaseNode({
  database,
  expanded,
  onToggle,
  initialSchema,
}: {
  database: Database;
  expanded?: boolean;
  onToggle: () => void;
  initialSchema?: SchemaId;
}) {
  const { data, isLoading, isError } = useListDatabaseSchemasQuery(
    expanded
      ? {
          id: database.id,
        }
      : skipToken,
  );

  const dispatch = useDispatch();
  const { expanded: expandedSchemas, toggle } = useExpandedState(initialSchema);

  if (isError) {
    throw new Error("Failed to load databases");
  }

  const onToggleSchema = (schemaId: SchemaId) => {
    if (!expandedSchemas[schemaId]) {
      dispatch(
        push(
          getUrl({
            databaseId: database.id,
            schemaId,
            tableId: undefined,
            fieldId: undefined,
          }),
        ),
      );
    }
    toggle(schemaId);
  };

  const singleSchema = !isLoading && data?.length === 1;

  const schemas = data?.map((name) => {
    const slug = `${database.id}:${name}`;
    return (
      <SchemaNode
        key={name}
        databaseId={database.id}
        schemaId={name}
        expanded={singleSchema || expandedSchemas[slug]}
        onToggle={() => onToggleSchema(slug)}
        flatten={singleSchema}
      />
    );
  });

  return (
    <Node
      type="database"
      name={database.name}
      expanded={expanded}
      onToggle={onToggle}
    >
      {isLoading ? (
        <Delay>
          <LoadingNode type="schema" />
          <LoadingNode type="schema" />
          <LoadingNode type="schema" />
        </Delay>
      ) : (
        schemas
      )}
    </Node>
  );
}

function SchemaNode({
  databaseId,
  schemaId,
  expanded,
  onToggle,
  flatten,
}: {
  databaseId: DatabaseId;
  schemaId: SchemaId;
  expanded?: boolean;
  onToggle: () => void;
  flatten?: boolean;
}) {
  const dispatch = useDispatch();
  const { data, isLoading, isError } = useListDatabaseSchemaTablesQuery(
    expanded
      ? {
          id: databaseId,
          schema: schemaId,
        }
      : skipToken,
  );

  if (isError) {
    throw new Error("Failed to load databases");
  }

  function toggleTable(tableId: TableId) {
    dispatch(
      push(
        getUrl({
          databaseId,
          schemaId,
          tableId,
          fieldId: undefined,
        }),
      ),
    );
  }

  const tables = data?.map((table) => (
    <Node
      key={table.id}
      type="table"
      name={table.display_name ?? table.name}
      onToggle={() => toggleTable(table.id)}
    />
  ));

  if (flatten) {
    return tables;
  }

  return (
    <Node type="schema" name={schemaId} expanded={expanded} onToggle={onToggle}>
      {isLoading ? (
        <Delay>
          <LoadingNode type="table" />
          <LoadingNode type="table" />
          <LoadingNode type="table" />
        </Delay>
      ) : (
        tables
      )}
    </Node>
  );
}

function SearchResults({ searchValue }: { searchValue: string }) {
  const { data, isLoading } = useSearchQuery({
    q: searchValue,
    models: ["table"],
  });

  type Tree = {
    [databaseName: string]: {
      id: DatabaseId;
      name: string;
      schemas: {
        [schemaName: string]: {
          id: SchemaId;
          name: string;
          tables: SearchResponse["data"][number][];
        };
      };
    };
  };

  const tree: Tree = {};
  data?.data.forEach((result) => {
    if (
      result.model !== "table" ||
      !result.database_name ||
      !result.table_schema
    ) {
      return;
    }

    tree[result.database_id] ??= {
      id: result.database_id,
      name: result.database_name,
      schemas: {},
    };
    tree[result.database_id].schemas[result.table_schema] ??= {
      id: result.table_schema,
      name: result.table_schema,
      tables: [],
    };
    tree[result.database_id].schemas[result.table_schema].tables.push(result);
  });

  const isEmpty = !isLoading && Object.keys(tree).length === 0;

  if (isEmpty) {
    return (
      <Box p="md">
        <EmptyState
          title={t`No results`}
          illustrationElement={<img src={NoResults} />}
        />
      </Box>
    );
  }

  return (
    <div>
      {Object.keys(tree)
        .sort()
        .map((id) => tree[id])
        .map((database) => (
          <Node key={database.id} type="database" name={database.name} expanded>
            {Object.keys(database.schemas)
              .sort()
              .map((schemaName) => database.schemas[schemaName])
              .map((schema) => (
                <Node key={schema.id} type="schema" name={schema.name} expanded>
                  {schema.tables.sort(byName).map((result) => (
                    <Node key={result.id} type="table" name={result.name} />
                  ))}
                </Node>
              ))}
          </Node>
        ))}
    </div>
  );
}

function byName(
  a: SearchResponse["data"][number],
  b: SearchResponse["data"][number],
) {
  return a.name.localeCompare(b.name);
}
