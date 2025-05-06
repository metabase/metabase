import cx from "classnames";
import { type ReactNode, useState } from "react";

import {
  skipToken,
  useListDatabaseSchemaTablesQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { Box, Flex, Icon } from "metabase/ui";
import type { Database, DatabaseId, SchemaId } from "metabase-types/api";

import S from "./TablePicker.module.css";
import { getIconForType, hasChildren } from "./utils";

export function TablePicker(props: {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
}) {
  const { databaseId, schemaId } = props;
  const { data, isLoading, isError } = useListDatabasesQuery();

  const [expandedDatabases, setExpandedDatabases] = useState<
    Record<DatabaseId, boolean>
  >(databaseId ? { [databaseId]: true } : {});

  if (isLoading) {
    return "LOADING";
  }
  if (isError) {
    throw new Error("Failed to load databases");
  }

  const toggleDatabase = (databaseId: DatabaseId) => {
    setExpandedDatabases((state) => ({
      ...state,
      [databaseId]: !state[databaseId],
    }));
  };

  return data?.data?.map((database) => (
    <DatabaseNode
      key={database.id}
      database={database}
      expanded={expandedDatabases[database.id]}
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

  const [expandedSchemas, setExpandedSchemas] = useState<{
    [key: SchemaId]: boolean;
  }>(initialSchema ? { [initialSchema]: true } : {});

  if (isError) {
    throw new Error("Failed to load databases");
  }

  const onToggleSchema = (schemaId: SchemaId) => {
    setExpandedSchemas((state) => ({ ...state, [schemaId]: !state[schemaId] }));
  };

  const singleSchema = !isLoading && data?.length === 1;

  return (
    <Node
      type="database"
      name={database.name}
      expanded={expanded}
      onToggle={onToggle}
    >
      {data?.map((name) => {
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
      })}
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
  const { data, isError } = useListDatabaseSchemaTablesQuery(
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

  const tables = data?.map((table) => (
    <Node key={table.id} type="table" name={table.display_name ?? table.name} />
  ));

  if (flatten) {
    return tables;
  }

  return (
    <Node type="schema" name={schemaId} expanded={expanded} onToggle={onToggle}>
      {tables}
    </Node>
  );
}

function Node({
  type,
  name,
  expanded,
  onToggle,
  children,
}: {
  type: "database" | "schema" | "table";
  name: string;
  expanded?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
}) {
  return (
    <Box my="md" className={S.node}>
      <Flex
        direction="row"
        align="center"
        gap="sm"
        onClick={onToggle}
        className={S.title}
      >
        {hasChildren(type) && (
          <Icon
            name="chevronright"
            size={10}
            className={cx(S.chevron, { [S.expanded]: expanded })}
            color="var(--mb-color-text-light)"
          />
        )}
        <Icon
          name={getIconForType(type)}
          color="var(--mb-color-text-placeholder)"
        />
        {name}
      </Flex>

      {expanded && <Box className={S.children}>{children}</Box>}
    </Box>
  );
}
