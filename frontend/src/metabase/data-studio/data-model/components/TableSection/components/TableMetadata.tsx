import type { ReactNode } from "react";
import { useId } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Link } from "metabase/common/components/Link";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import { isNullOrUndefined } from "metabase/lib/types";
import { dependencyGraph } from "metabase/lib/urls/dependencies";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Group, Stack, Text } from "metabase/ui";
import type { Table } from "metabase-types/api";

interface Props {
  table: Table;
}

export function TableMetadata({ table }: Props) {
  const formattedDate = new Date(table.updated_at).toLocaleString();
  const formatNumber = useNumberFormatter();
  const isDependenciesEnabled = PLUGIN_DEPENDENCIES.isEnabled;

  const { dependenciesCount, dependentsCount } =
    PLUGIN_DEPENDENCIES.useGetDependenciesCount({
      id: Number(table.id),
      type: "table",
    });

  return (
    <Stack gap="md">
      <MetadataRow label={t`Name in the database`} value={table.name} />
      <MetadataRow label={t`Last updated at`} value={formattedDate} />
      <MetadataRow
        label={t`View count`}
        value={formatNumber(table.view_count)}
      />
      {!isNullOrUndefined(table.estimated_row_count) ? (
        <MetadataRow
          label={t`Est. row count`}
          value={formatNumber(table.estimated_row_count)}
        />
      ) : null}
      {isDependenciesEnabled && (
        <>
          <MetadataRow
            label={t`Dependencies`}
            value={
              <DependencyLink tableId={Number(table.id)}>
                {dependenciesCount}
              </DependencyLink>
            }
          />
          <MetadataRow
            label={t`Dependents`}
            value={
              <DependencyLink tableId={Number(table.id)}>
                {dependentsCount}
              </DependencyLink>
            }
          />
        </>
      )}
    </Stack>
  );
}

function DependencyLink({
  children,
  tableId,
}: {
  children: ReactNode;
  tableId: number;
}) {
  return (
    <Link
      to={dependencyGraph({
        entry: { id: tableId, type: "table" },
      })}
      variant="brand"
      style={{
        fontWeight: "bold",
      }}
    >
      {children}
    </Link>
  );
}

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined | ReactNode;
}) {
  const id = useId();
  return (
    <Group justify="space-between" gap="lg" wrap="nowrap">
      <Text size="md" c="text-primary" id={id} flex="1 0 auto">
        {label}
      </Text>
      <Ellipsified
        size="md"
        c="text-primary"
        aria-labelledby={id}
        tooltipProps={{ maw: "unset" }}
      >
        {value}
      </Ellipsified>
    </Group>
  );
}
