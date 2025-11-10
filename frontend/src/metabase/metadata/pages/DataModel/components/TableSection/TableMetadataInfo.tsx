import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import Link from "metabase/common/components/Link";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import { isNullOrUndefined } from "metabase/lib/types";
import { dependencyGraph } from "metabase/lib/urls/dependencies";
import { Group, Stack, Text } from "metabase/ui";
import { useGetDependencyGraphQuery } from "metabase-enterprise/api";
import type { Table } from "metabase-types/api";

interface Props {
  table: Table;
}

export function TableMetadataInfo({ table }: Props) {
  const formattedDate = new Date(table.updated_at).toLocaleString();
  const formatNumber = useNumberFormatter();

  const { data: dependencyGraphData } = useGetDependencyGraphQuery(
    table.id != null ? { id: Number(table.id), type: "table" } : skipToken,
  );

  const { dependenciesCount, dependentsCount } = useMemo(() => {
    if (!dependencyGraphData) {
      return { dependenciesCount: 0, dependentsCount: 0 };
    }
    const thisTable = dependencyGraphData.nodes.find(
      (node) => node.id === table.id,
    );
    const dependentsCount = Object.values(
      thisTable?.dependents_count ?? {},
    ).reduce((acc, curr) => acc + curr, 0);

    if (!dependencyGraphData?.edges) {
      return { dependenciesCount: 0, dependentsCount };
    }

    // Dependencies: edges pointing TO this table (things this table depends on)
    const dependencies = dependencyGraphData.edges.filter(
      (edge) =>
        edge.to_entity_id === table.id && edge.to_entity_type === "table",
    ).length;

    return { dependenciesCount: dependencies, dependentsCount };
  }, [dependencyGraphData, table.id]);

  return (
    <Stack gap="md">
      <MetadataRow label={t`Name on disk`} value={table.name} />
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
  return (
    <Group justify="space-between">
      <Text size="md" c="text-primary">
        {label}
      </Text>
      <Text size="md" c="text-primary">
        {value}
      </Text>
    </Group>
  );
}
