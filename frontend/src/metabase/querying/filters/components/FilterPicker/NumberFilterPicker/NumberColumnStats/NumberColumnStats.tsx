import { t } from "ttag";

import { Box } from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting/numbers";

import S from "./NumberColumnStats.module.css";
import type { NumberColumnStats as Stats } from "./utils";

interface NumberColumnStatsProps {
  stats: Stats;
}

export function NumberColumnStats({ stats }: NumberColumnStatsProps) {
  const rows = [
    { label: t`Count`, value: formatStat(stats.count) },
    {
      label: t`Range`,
      value:
        stats.min != null && stats.max != null
          ? `${formatStat(stats.min)} – ${formatStat(stats.max)}`
          : formatStat(null),
    },
    { label: t`Average`, value: formatStat(stats.avg) },
    { label: t`Sum`, value: formatStat(stats.sum) },
  ];

  return (
    <Box px="xl" pt="xl" data-testid="number-column-stats">
      {rows.map(({ label, value }) => (
        <div key={label} className={S.row}>
          <span className={S.label}>{label}</span>
          <span className={S.value}>{value}</span>
        </div>
      ))}
    </Box>
  );
}

function formatStat(value: number | null) {
  return value != null
    ? formatNumber(value, { maximumFractionDigits: 2 })
    : "—";
}
