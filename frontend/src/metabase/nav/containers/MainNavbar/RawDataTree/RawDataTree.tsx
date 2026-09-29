import { type ReactNode, useState } from "react";
import { t } from "ttag";

import {
  useListDatabaseSchemaTablesQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { TreeNode } from "metabase/common/components/tree/TreeNode";
import { Box, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  ConcreteTableId,
  Database,
  DatabaseId,
  IconName,
  Table,
} from "metabase-types/api";
import { isConcreteTableId } from "metabase-types/api";

import {
  CollectionNodeRoot,
  ExpandToggleButton,
  FullWidthLink,
  NameContainer,
  SidebarIcon,
} from "../SidebarItems/SidebarItems.styled";

/**
 * The warehouse as a tree: databases, their schemas, and the tables in them. Each row links to the
 * browse page it stands for, so the tree is a faster way to the same destinations rather than a
 * second way of looking at data. Children are only fetched once a node is expanded.
 */
export function RawDataTree() {
  const { data, isLoading, error } = useListDatabasesQuery();
  const databases = data?.data ?? [];

  if (isLoading || error) {
    return (
      <Box p="lg">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Box>
    );
  }

  if (databases.length === 0) {
    return (
      <Text
        p="lg"
        c="text-secondary"
      >{t`No databases are connected yet.`}</Text>
    );
  }

  return (
    <ul role="tree" aria-label="raw-data-tree">
      {databases.map((database) => (
        <DatabaseNode key={database.id} database={database} />
      ))}
    </ul>
  );
}

function DatabaseNode({ database }: { database: Database }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <DataRow
        depth={0}
        icon="database"
        name={database.name}
        url={Urls.browseDatabase(database)}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
      />
      {isExpanded && <SchemaNodes database={database} />}
    </>
  );
}

function SchemaNodes({ database }: { database: Database }) {
  const { data: schemas = [], isLoading } = useListDatabaseSchemasQuery({
    id: database.id,
  });

  if (isLoading) {
    return <Placeholder depth={1} name={t`Loading…`} />;
  }

  if (schemas.length === 0) {
    return <Placeholder depth={1} name={t`No schemas`} />;
  }

  return (
    <>
      {schemas.map((schema) => (
        <SchemaNode key={schema} database={database} schema={schema} />
      ))}
    </>
  );
}

function SchemaNode({
  database,
  schema,
}: {
  database: Database;
  schema: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <DataRow
        depth={1}
        icon="folder"
        name={schema}
        url={Urls.browseSchemaBySlug(Urls.databaseSlug(database), schema)}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
      />
      {isExpanded && <TableNodes databaseId={database.id} schema={schema} />}
    </>
  );
}

function TableNodes({
  databaseId,
  schema,
}: {
  databaseId: DatabaseId;
  schema: string;
}) {
  const { data: tables = [], isLoading } = useListDatabaseSchemaTablesQuery({
    id: databaseId,
    schema,
  });

  if (isLoading) {
    return <Placeholder depth={2} name={t`Loading…`} />;
  }

  if (tables.length === 0) {
    return <Placeholder depth={2} name={t`No tables`} />;
  }

  return (
    <>
      {tables.filter(isConcreteTable).map((table) => (
        <DataRow
          key={table.id}
          depth={2}
          icon="table"
          name={table.display_name || table.name}
          url={Urls.table({
            id: table.id,
            name: table.display_name || table.name,
          })}
        />
      ))}
    </>
  );
}

type DataRowProps = {
  depth: number;
  icon: IconName;
  name: string;
  url: string;
  /** Omitted for leaves, which keep the toggle's width as indentation. */
  isExpanded?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
};

function DataRow({
  depth,
  icon,
  name,
  url,
  isExpanded,
  onToggle,
}: DataRowProps) {
  return (
    <CollectionNodeRoot
      role="treeitem"
      depth={depth}
      aria-expanded={onToggle ? isExpanded : undefined}
      isSelected={false}
      hasDefaultIconStyle
    >
      <ExpandToggleButton hidden={!onToggle} onClick={onToggle}>
        <TreeNode.ExpandToggleIcon
          isExpanded={Boolean(isExpanded)}
          name="chevronright"
          size={12}
        />
      </ExpandToggleButton>
      <FullWidthLink to={url}>
        <TreeNode.IconContainer transparent={false}>
          <SidebarIcon name={icon} isSelected={false} />
        </TreeNode.IconContainer>
        <NameContainer>{name}</NameContainer>
      </FullWidthLink>
    </CollectionNodeRoot>
  );
}

/**
 * The Saved Questions virtual database exposes cards as tables with virtual ids, which have no
 * /table/:slug route. Nothing in the warehouse tree should point at those.
 */
function isConcreteTable(
  table: Table,
): table is Table & { id: ConcreteTableId } {
  return isConcreteTableId(table.id);
}

function Placeholder({ depth, name }: { depth: number; name: string }) {
  return (
    <CollectionNodeRoot role="treeitem" depth={depth} isSelected={false}>
      <ExpandToggleButton hidden />
      <Text size="sm" c="text-secondary" px="sm">
        {name}
      </Text>
    </CollectionNodeRoot>
  );
}
