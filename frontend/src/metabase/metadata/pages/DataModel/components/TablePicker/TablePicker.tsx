import { push } from "react-router-redux";

import {
  skipToken,
  useListDatabaseSchemaTablesQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import type {
  Database,
  DatabaseId,
  SchemaId,
  TableId,
} from "metabase-types/api";

import { getUrl } from "../../utils";

import { Delay, LoadingNode, Node } from "./Node";
import { useExpandedState } from "./utils";

export function TablePicker(props: {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
}) {
  const { databaseId, schemaId } = props;
  const { data, isLoading, isError } = useListDatabasesQuery();

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
