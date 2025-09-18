import { t } from "ttag";

import { skipToken, useGetDatabaseQuery, useGetTableQuery } from "metabase/api";
import Link from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import {
  Divider,
  Group,
  Icon,
  type IconName,
  Loader,
  Stack,
  Text,
} from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { SplitSection } from "../../../components/SplitSection";
import {
  getBrowseDatabaseUrl,
  getBrowseSchemaUrl,
  getQueryBuilderUrl,
} from "../../../urls";

type SourceSectionProps = {
  transform: Transform;
};

export function SourceSection({ transform }: SourceSectionProps) {
  if (transform.source.type !== "python") {
    return null;
  }

  return (
    <SplitSection
      label={t`Transform source`}
      description={t`The data sources for this Python transform.`}
    >
      <Group p="lg">
        <SourceInfo transform={transform} />
      </Group>
    </SplitSection>
  );
}

type SourceInfoProps = {
  transform: Transform;
};

function SourceInfo({ transform }: SourceInfoProps) {
  if (transform.source.type !== "python") {
    return null;
  }

  const sourceDatabaseId = transform.source["source-database"];
  const sourceTables = transform.source["source-tables"];

  const { data: database, isLoading: isDatabaseLoading } = useGetDatabaseQuery(
    sourceDatabaseId ? { id: sourceDatabaseId } : skipToken,
  );

  const hasMultipleTables =
    sourceTables && Object.keys(sourceTables).length > 0;

  if (isDatabaseLoading) {
    return <Loader size="sm" />;
  }

  // Display for multiple tables
  if (hasMultipleTables) {
    return (
      <Stack gap="sm">
        {database && (
          <Group gap="sm">
            <SourceItemLink
              label={database.name}
              icon="database"
              to={getBrowseDatabaseUrl(database.id)}
              data-testid="source-database-link"
            />
          </Group>
        )}
        <Divider />
        <Stack gap="xs">
          <Text size="sm" fw={500}>{t`Tables:`}</Text>
          {Object.entries(sourceTables).map(([alias, tableId]) => (
            <TableWithAlias
              key={alias}
              alias={alias}
              tableId={tableId}
              databaseId={sourceDatabaseId}
            />
          ))}
        </Stack>
      </Stack>
    );
  }

  // Just show database if no tables selected
  return (
    <Group gap="sm">
      {database != null && (
        <SourceItemLink
          label={database.name}
          icon="database"
          to={getBrowseDatabaseUrl(database.id)}
          data-testid="source-database-link"
        />
      )}
    </Group>
  );
}

type TableWithAliasProps = {
  alias: string;
  tableId: number;
  databaseId: number;
};

function TableWithAlias({ alias, tableId, databaseId }: TableWithAliasProps) {
  const { data: table, isLoading } = useGetTableQuery(
    tableId ? { id: tableId } : skipToken,
  );

  if (isLoading) {
    return <Loader size="xs" />;
  }

  return (
    <Group gap="sm" pl="md">
      <Text size="sm" c="dimmed">
        {alias}:
      </Text>
      <Group gap="xs">
        {table?.schema && (
          <>
            <SourceItemLink
              label={table.schema}
              icon="folder"
              to={getBrowseSchemaUrl(databaseId, table.schema)}
              small
            />
            <SourceItemDivider />
          </>
        )}
        <SourceItemLink
          label={table?.display_name || table?.name || `Table ${tableId}`}
          icon="table2"
          to={table ? getQueryBuilderUrl(table.id, table.db_id) : undefined}
          data-testid={`source-table-${alias}-link`}
          small
        />
      </Group>
    </Group>
  );
}

type SourceItemLinkProps = {
  label: string;
  icon: IconName;
  to?: string;
  "data-testid"?: string;
  small?: boolean;
};

function SourceItemLink({
  label,
  icon,
  to,
  "data-testid": dataTestId,
  small = false,
}: SourceItemLinkProps) {
  return (
    <Link
      className={CS.link}
      to={to ?? ""}
      disabled={to == null}
      data-testid={dataTestId}
    >
      <Group gap="xs">
        <Icon name={icon} size={small ? 14 : 16} />
        <Text c="inherit" size={small ? "sm" : "md"}>
          {label}
        </Text>
      </Group>
    </Link>
  );
}

function SourceItemDivider() {
  return <Icon name="chevronright" size={8} />;
}
