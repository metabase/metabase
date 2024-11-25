import { sumMetric } from "metabase/visualizations/lib/dataset";
import { getColumnDescriptors } from "metabase/visualizations/lib/graph/columns";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import { isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, RawSeries, RowValue } from "metabase-types/api";

import { NULL_CHAR } from "../../../cartesian/constants/dataset";

import type {
  SankeyChartColumns,
  SankeyData,
  SankeyLink,
  SankeyNode,
} from "./types";

export const getSankeyChartColumns = <TColumn extends DatasetColumn>(
  columns: TColumn[],
  settings: Pick<
    ComputedVisualizationSettings,
    "sankey.source" | "sankey.target" | "sankey.value"
  >,
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

  if (!source.column || !target.column || !value.column) {
    return null;
  }

  return {
    source,
    target,
    value,
  };
};

export const getSankeyData = (
  rawSeries: RawSeries,
  sankeyColumns: SankeyChartColumns,
): SankeyData => {
  const [
    {
      data: { rows, cols },
    },
  ] = rawSeries;

  // getColumnKey and isMetric are slow so we compute needed metadata here instead of when iterating through rows
  const columnInfos = cols.map(column => ({
    key: getColumnKey(column),
    isMetric: isMetric(column),
  }));

  const valueToNode = new Map<RowValue, SankeyNode>();

  function updateNode(
    value: RowValue,
    level: number,
    type: "source" | "target",
    row: RowValue[],
  ): SankeyNode {
    const node = valueToNode.get(value) ?? {
      value,
      level,
      hasInputs: false,
      hasOutputs: false,
      inputColumnValues: {},
      outputColumnValues: {},
    };

    node.level = Math.max(node.level, level);
    node.hasInputs = node.hasInputs || type === "target";
    node.hasOutputs = node.hasOutputs || type === "source";

    cols.forEach((_column, index) => {
      const columnKey = columnInfos[index].key;
      const columnValue = row[index];
      const isMetric = columnInfos[index].isMetric;

      if (type === "target") {
        if (isMetric) {
          node.inputColumnValues[columnKey] = sumMetric(
            node.inputColumnValues[columnKey],
            columnValue,
          );
        } else {
          node.inputColumnValues[columnKey] = columnValue;
        }
      } else {
        if (isMetric) {
          node.outputColumnValues[columnKey] = sumMetric(
            node.outputColumnValues[columnKey],
            columnValue,
          );
        } else {
          node.outputColumnValues[columnKey] = columnValue;
        }
      }
    });

    valueToNode.set(value, node);
    return node;
  }

  const linkMap = new Map<string, SankeyLink>();

  rows.forEach(row => {
    const source = row[sankeyColumns.source.index];
    const target = row[sankeyColumns.target.index];
    const value = row[sankeyColumns.value.index];

    const sourceInfo = updateNode(source, 0, "source", row);
    updateNode(target, sourceInfo.level + 1, "target", row);

    const linkKey = `${NULL_CHAR}${source}->${target}`;

    const link: SankeyLink = linkMap.get(linkKey) ?? {
      source,
      target,
      value: 0,
      columnValues: {},
    };

    link.value = sumMetric(link.value, value);
    cols.forEach((_column, index) => {
      const columnKey = columnInfos[index].key;
      const columnValue = row[index];

      link.columnValues[columnKey] = columnInfos[index].isMetric
        ? sumMetric(link.columnValues[columnKey], columnValue)
        : columnValue;
    });

    linkMap.set(linkKey, link);
  });

  return {
    nodes: Array.from(valueToNode.values()),
    links: Array.from(linkMap.values()),
  };
};
