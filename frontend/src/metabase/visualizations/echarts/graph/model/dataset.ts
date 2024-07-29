import { sumMetric } from "metabase/visualizations/lib/dataset";
import { getColumnDescriptors } from "metabase/visualizations/lib/graph/columns";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn, RawSeries, RowValue } from "metabase-types/api";

import { NULL_CHAR } from "../../cartesian/constants/dataset";

import type { SankeyChartColumns, SankeyLink } from "./types";

export const getSankeyChartColumns = <TColumn extends DatasetColumn>(
  columns: TColumn[],
  settings: ComputedVisualizationSettings,
): SankeyChartColumns | null => {
  if (
    settings["sankey.source"] == null ||
    settings["sankey.target"] == null ||
    settings["sankey.value"] == null
  ) {
    return null;
  }

  const source = getColumnDescriptors([settings["sankey.source"]], columns)[0];
  const target = getColumnDescriptors([settings["sankey.target"]], columns)[0];
  const value = getColumnDescriptors([settings["sankey.value"]], columns)[0];

  return {
    source,
    target,
    value,
  };
};

export const getSankeyData = (
  rawSeries: RawSeries,
  sankeyColumns: SankeyChartColumns,
) => {
  const [
    {
      data: { rows },
    },
  ] = rawSeries;

  const nodeToLevel = new Map<RowValue, number>();

  function getOrSetNodeLevel(name: RowValue, level: number): number {
    const currentLevel = nodeToLevel.get(name);

    if (currentLevel == null) {
      nodeToLevel.set(name, level);
      return level;
    }

    const newLevel = Math.max(currentLevel, level);
    nodeToLevel.set(name, newLevel);

    return newLevel;
  }

  const linkMap = new Map<string, SankeyLink>();

  rows.forEach(row => {
    const source = row[sankeyColumns.source.index];
    const target = row[sankeyColumns.target.index];
    const value = row[sankeyColumns.value.index];

    const sourceLevel = getOrSetNodeLevel(source, 0);
    getOrSetNodeLevel(target, sourceLevel + 1);

    const linkKey = `${NULL_CHAR}${source}->${target}`;

    const existingLink = linkMap.get(linkKey);
    if (existingLink == null) {
      linkMap.set(linkKey, {
        source,
        target,
        value,
      });
    } else {
      existingLink.value = sumMetric(existingLink.value, value);
    }
  });

  const levels: RowValue[][] = [];
  for (const [node, level] of nodeToLevel.entries()) {
    if (!levels[level]) {
      levels[level] = [];
    }

    levels[level].push(node);
  }

  return {
    levels,
    links: Array.from(linkMap.values()),
  };
};
