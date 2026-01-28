import { useMemo } from "react";
import { t } from "ttag";

import {
  Card,
  Text,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type { TreeNodeData } from "metabase/ui/components/data-display/TreeTable/types";
import type { TransformInspectFieldStats } from "metabase-types/api";

interface StatRow extends TreeNodeData {
  id: string;
  label: string;
  value: string | number;
}

type FieldStatsTableProps = {
  stats?: TransformInspectFieldStats;
};

export const FieldsStatsTable = ({ stats }: FieldStatsTableProps) => {
  const data = useMemo(() => {
    if (!stats) {
      return [];
    }
    const rows: StatRow[] = [];

    if (stats.distinct_count != null) {
      rows.push({
        id: "distinct_count",
        label: t`Distinct count`,
        value: stats.distinct_count,
      });
    }
    if (stats.nil_percent != null) {
      rows.push({
        id: "nil_percent",
        label: t`Nil %`,
        value: `${(stats.nil_percent * 100).toFixed(1)}%`,
      });
    }
    if (stats.min != null) {
      rows.push({ id: "min", label: t`Min`, value: stats.min });
    }
    if (stats.max != null) {
      rows.push({ id: "max", label: t`Max`, value: stats.max });
    }
    if (stats.avg != null) {
      rows.push({
        id: "avg",
        label: t`Avg`,
        value: Number(stats.avg.toFixed(2)),
      });
    }
    return rows;
  }, [stats]);

  const columns: TreeTableColumnDef<StatRow>[] = [
    {
      id: "label",
      header: t`Stat`,
      cell: ({ row }) => <Text c="text-secondary">{row.original.label}</Text>,
    },
    {
      id: "value",
      header: t`Value`,
      cell: ({ row }) => <Text ta="right">{row.original.value}</Text>,
    },
  ];

  const instance = useTreeTableInstance({
    data,
    columns,
    getNodeId: (node) => node.id,
  });

  return (
    <Card p={0} shadow="none" withBorder>
      <TreeTable instance={instance} />
    </Card>
  );
};
