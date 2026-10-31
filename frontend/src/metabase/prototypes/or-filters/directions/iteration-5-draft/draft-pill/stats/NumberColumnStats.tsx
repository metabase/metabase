import { msgid, ngettext, t } from "ttag";

import { Box } from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting/numbers";

import S from "./NumberColumnStats.module.css";
import type { NumberMatchCount } from "./use-number-column-stats";
import { type NumberColumnStats as Stats, roundEstimate } from "./utils";

interface NumberColumnStatsProps {
  stats: Stats;
  isEstimate: boolean;
}

export function NumberColumnStats({
  stats,
  isEstimate,
}: NumberColumnStatsProps) {
  const prefix = isEstimate ? "≈ " : "";
  const rows = [
    { label: t`Count`, value: prefix + formatStat(stats.count) },
    {
      label: t`Range`,
      value:
        stats.min != null && stats.max != null
          ? `${prefix}${formatStat(stats.min)} – ${formatStat(stats.max)}`
          : formatStat(null),
    },
    { label: t`Average`, value: prefix + formatStat(stats.avg) },
    { label: t`Sum`, value: prefix + formatStat(stats.sum) },
  ];

  return (
    <Box px="xl" pt="xl" data-testid="number-column-stats">
      {rows.map(({ label, value }) => (
        <div key={label} className={S.row}>
          <span className={S.label}>{label}</span>
          <span className={S.value}>{value}</span>
        </div>
      ))}
      {isEstimate && <SampleNote />}
    </Box>
  );
}

export function MatchCount({ matchCount }: { matchCount: NumberMatchCount }) {
  const { count, isEstimate, isFew } = matchCount;
  const value = isEstimate ? roundEstimate(count) : count;
  const formatted = (isEstimate ? "~" : "") + formatNumber(value);
  return (
    <div className={S.matchCount} data-testid="number-filter-match-count">
      {isFew
        ? t`Matches very few rows`
        : ngettext(
            msgid`Matches ${formatted} row`,
            `Matches ${formatted} rows`,
            value,
          )}
    </div>
  );
}

export function SampleNote() {
  return (
    <div className={S.sampleNote} data-testid="number-column-stats-sample">
      {t`Estimated from a sample of the data.`}
    </div>
  );
}

export function UnavailableNote() {
  return (
    <div
      className={S.unavailableNote}
      data-testid="number-column-stats-unavailable"
    >
      {t`Preview is unavailable for these filters.`}
    </div>
  );
}

function formatStat(value: number | null) {
  return value != null
    ? formatNumber(value, { maximumFractionDigits: 2 })
    : "—";
}
