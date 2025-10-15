import { t } from "ttag";

import { skipToken, useGetTableQuery } from "metabase/api";
import Link from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { Box, Group, Icon, type IconName, Loader, Stack } from "metabase/ui";
import { SplitSection } from "metabase-enterprise/transforms/components/SplitSection";
import {
  getBrowseDatabaseUrl,
  getBrowseSchemaUrl,
  getQueryBuilderUrl,
} from "metabase-enterprise/transforms/urls";
import type { Transform } from "metabase-types/api";

import S from "./SourceSection.module.css";

type SourceSectionProps = {
  transform: Transform;
};

export function SourceSection({ transform }: SourceSectionProps) {
  const { source } = transform;
  if (source.type !== "python") {
    return null;
  }

  const { "source-database": sourceDatabaseId, "source-tables": sourceTables } =
    source;

  return (
    <SplitSection
      label={t`Transform source`}
      description={t`The data sources for this Python transform, by alias.`}
    >
      <Stack p="lg" gap="sm" className={S.grid}>
        {Object.entries(sourceTables).map(([alias, tableId]) => (
          <TableWithAlias
            key={alias}
            alias={alias}
            tableId={tableId as number}
            databaseId={sourceDatabaseId as number}
          />
        ))}
      </Stack>
    </SplitSection>
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
    return <Loader size="xs" data-testid="loader" />;
  }

  return (
    <>
      <Group className={S.alias}>{alias}</Group>
      <Group gap="sm">
        {table?.db && (
          <>
            <SourceItemLink
              label={table.db.name}
              icon="database"
              to={getBrowseDatabaseUrl(table.db.id)}
              data-testid="source-database-link"
            />
            <SourceItemDivider />
          </>
        )}
        {table?.schema && (
          <>
            <SourceItemLink
              label={table.schema}
              icon="folder"
              to={getBrowseSchemaUrl(databaseId, table.schema)}
            />
            <SourceItemDivider />
          </>
        )}
        <SourceItemLink
          label={table?.display_name || table?.name || `Table ${tableId}`}
          icon="table2"
          to={table ? getQueryBuilderUrl(table.id, table.db_id) : undefined}
        />
      </Group>
    </>
  );
}

type SourceItemLinkProps = {
  label: string;
  icon: IconName;
  to?: string;
};

function SourceItemLink({ label, icon, to }: SourceItemLinkProps) {
  return (
    <Link className={CS.link} to={to ?? ""} disabled={to == null}>
      <Group gap="xs" align="center" justify="center">
        <Icon name={icon} />
        <Box>{label}</Box>
      </Group>
    </Link>
  );
}

function SourceItemDivider() {
  return <Icon name="chevronright" size={8} />;
}
