import { t } from "ttag";

import { getOptionFromColumn } from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultDimensions,
  getDefaultMetrics,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import type {
  ComputedVisualizationSettings,
  VisualizationProps,
} from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { RawSeries } from "metabase-types/api";

import { ChartRenderer } from "./TreeMap.styled";

const __DIMENSIONS = "treemap.dimensions";
const __MEASURES = "treemap.measures";

Object.assign(TreeMap, {
  uiName: t`Treemap`,
  identifier: "treemap",
  iconName: "ai",
  placeholderSeries: [],
  settings: {
    [__DIMENSIONS]: {
      section: t`Columns`,
      title: t`Dimensions`,
      widget: "fields",
      getDefault: (series, vizSettings) =>
        getDefaultDimensions(series, vizSettings),
      getProps: ([{ _card, data }], vizSettings) => {
        const addedDimensions = vizSettings[__DIMENSIONS] || [];
        const options = data.cols.filter(isDimension).map(getOptionFromColumn);
        return {
          options,
          addAnother:
            options.length > addedDimensions.length
              ? t`Add series breakout`
              : null,
          columns: data.cols,
        };
      },
    },
    [__MEASURES]: {
      section: t`Columns`,
      title: t`Measures`,
      widget: "field",
      getDefault: (series, vizSettings) =>
        getDefaultMetrics(series, vizSettings),
      getProps: ([{ _card, data }], _vizSettings) => {
        const options = data.cols.filter(isMetric).map(getOptionFromColumn);
        return {
          options,
        };
      },
    },
  },
});

type Node = {
  name: string;
  value: number;
  childrenMap: Map<string, Node>;
};
type ResultNode = {
  name: string;
  value: number;
  children: Node[];
};
type Row = {
  path: string[];
  value: number;
};

function gen(data: Array<Row>): Array<Node> {
  const root: Node = {
    name: "_root",
    value: 0,
    childrenMap: new Map(),
  };
  let node: Node;
  for (const row of data) {
    node = root;
    const value = row.value;
    for (let i = 0; i < row.path.length; i++) {
      const label = row.path[i];
      node.value += value;
      if (!node.childrenMap.has(label)) {
        node.childrenMap.set(label, {
          name: label,
          value: value,
          childrenMap: new Map(),
        });
      }
      node = node.childrenMap.get(label);
    }
  }

  function dfs(n: Node): ResultNode {
    const newNode = {
      name: n.name,
      value: n.value,
      children: [],
    };
    for (const cn of n.childrenMap.values()) {
      newNode.children.push(dfs(cn));
    }
    return newNode;
  }

  const res = dfs(root);
  return res.children;
}

function getTreeMapModel(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
) {
  const [
    {
      data: { rows: rows, cols: cols },
    },
  ] = rawSeries;

  const dimensions = settings[__DIMENSIONS];
  const measure = settings[__MEASURES];
  const colNames = new Map(cols.map((v, i) => [v.name, i]));
  const dimIndexes = dimensions.map(value => colNames.get(value));
  const measIndex = colNames.get(measure);

  const modeled = rows.map(value => {
    return {
      path: dimIndexes.map(v => (value[v] || "").toString()),
      value: Number(value[measIndex]),
    };
  });
  return gen(modeled);
}

export function TreeMap(props: VisualizationProps) {
  const { rawSeries, settings } = props;

  const data = getTreeMapModel(rawSeries, settings);

  const option = {
    series: [
      {
        type: "treemap",
        nodeClick: false,
        breadcrumb: {
          show: false,
        },
        data,
      },
    ],
  };
  return (
    <ChartRenderer
      option={option}
      width={"auto"}
      height={"auto"}
      onResize={(_width: number, _height: number) => undefined}
      notMerge={false}
      style={null}
    />
  );
}
