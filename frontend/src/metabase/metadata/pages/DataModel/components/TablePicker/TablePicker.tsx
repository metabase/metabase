import cx from "classnames";
import { type ReactNode, useEffect, useState } from "react";
import { push } from "react-router-redux";
import { useMount } from "react-use";

import {
  skipToken,
  useListDatabaseSchemaTablesQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { Box, Flex, Icon, Skeleton } from "metabase/ui";
import type {
  Database,
  DatabaseId,
  SchemaId,
  TableId,
} from "metabase-types/api";

import { getUrl } from "../../utils";

import S from "./TablePicker.module.css";
import { getIconForType, hasChildren } from "./utils";

export function TablePicker(props: {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
}) {
  const { databaseId, schemaId } = props;
  const { data, isLoading, isError } = useListDatabasesQuery();

  const dispatch = useDispatch();
  const [expandedDatabases, setExpandedDatabases] = useState<
    Record<DatabaseId, boolean>
  >(databaseId ? { [databaseId]: true } : {});

  useEffect(() => {
    if (databaseId === undefined) {
      return;
    }
    setExpandedDatabases((state) => ({ ...state, [databaseId]: true }));
  }, [databaseId]);

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
    if (!expandedDatabases[databaseId]) {
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

  const dispatch = useDispatch();
  const [expandedSchemas, setExpandedSchemas] = useState<{
    [key: SchemaId]: boolean;
  }>(initialSchema ? { [initialSchema]: true } : {});

  useEffect(() => {
    if (initialSchema === undefined) {
      return;
    }
    setExpandedSchemas((state) => ({ ...state, [initialSchema]: true }));
  }, [initialSchema]);

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

    setExpandedSchemas((state) => ({ ...state, [schemaId]: !state[schemaId] }));
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

function Node({
  type,
  name,
  expanded,
  onToggle,
  children,
}: {
  type: "database" | "schema" | "table";
  name: ReactNode;
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
        className={cx(S.title, { [S.clickable]: onToggle })}
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

function LoadingNode({ type }: { type: "database" | "schema" | "table" }) {
  const w = 20 + Math.random() * 80;
  return (
    <Node
      type={type}
      name={<Skeleton height={10} width={`${w}%`} radius="sm" />}
    />
  );
}

function Delay({
  delay = 100,
  children,
}: {
  delay?: number;
  children: ReactNode;
}) {
  const [show, setShow] = useState(false);

  useMount(() => {
    const timeout = setTimeout(() => {
      setShow(true);
    }, delay);
    return () => clearTimeout(timeout);
  });

  if (!show) {
    return null;
  }

  return children;
}
