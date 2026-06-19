import { useMemo } from "react";
import { t } from "ttag";

import { Center, Text } from "metabase/ui";
import { color } from "metabase/ui/colors";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";

export interface PivotTotal {
  name: string;
  displayName: string;
  value: number | null;
  isPercent: boolean;
}

interface PivotTableTotalsChartProps {
  totals: PivotTotal[];
  height: number;
}

/**
 * Renders the pivot table's grand "Totals" as a line chart. Only the percent
 * (rate) measures are plotted as a curve — e.g. the d0..d30 retention rates —
 * which is the meaningful trend. Non-percent count columns (new_user) are not
 * plotted because they are not part of the per-day curve.
 */
export function PivotTableTotalsChart({
  totals,
  height,
}: PivotTableTotalsChartProps) {
  const option = useMemo(() => {
    const percentTotals = totals.filter((t_) => t_.isPercent);
    const labels = percentTotals.map((t_) => t_.displayName);
    const values = percentTotals.map((t_) =>
      t_.value == null ? null : t_.value,
    );

    return {
      grid: { left: 56, right: 24, top: 24, bottom: 48, containLabel: false },
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? params : [params];
          const axisLabel = (items[0] as { axisValueLabel?: string })
            ?.axisValueLabel;
          const lines = (
            items as Array<{ seriesName?: string; value?: unknown }>
          )
            .map((item) => {
              const v = item.value;
              const formatted =
                typeof v === "number" ? `${(v * 100).toFixed(2)}%` : "—";
              return `<b>${item.seriesName ?? ""} ${formatted}</b>`;
            })
            .join("<br/>");
          return axisLabel ? `${axisLabel}<br/>${lines}` : lines;
        },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { color: color("text-secondary"), hideOverlap: true },
        axisLine: { lineStyle: { color: color("border") } },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: color("text-secondary"),
          formatter: (v: number) => `${Math.round(v * 100)}%`,
        },
        splitLine: { lineStyle: { color: color("border") } },
      },
      series: [
        {
          type: "line",
          name: t`Totals`,
          data: values,
          smooth: false,
          connectNulls: false,
          showSymbol: true,
          symbolSize: 6,
          lineStyle: { width: 2, color: color("brand") },
          itemStyle: { color: color("brand") },
        },
      ],
    };
  }, [totals]);

  const hasPercentTotals = totals.some(
    (t_) => t_.isPercent && t_.value != null,
  );

  if (!hasPercentTotals) {
    return (
      <Center h={height} data-testid="pivot-totals-chart-empty">
        <Text c="text-secondary">{t`No total values to chart.`}</Text>
      </Center>
    );
  }

  return (
    // position: relative so the absolutely-positioned ECharts renderer
    // (inset: 0) fills this fixed-height box.
    <div
      style={{ position: "relative", width: "100%", height }}
      data-testid="pivot-totals-chart"
    >
      <ResponsiveEChartsRenderer option={option} />
    </div>
  );
}
