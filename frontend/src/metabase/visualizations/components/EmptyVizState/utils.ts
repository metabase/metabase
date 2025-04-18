import { t } from "ttag";

import areaEmptyState from "assets/img/empty-states/visualizations/area.svg";
import barEmptyState from "assets/img/empty-states/visualizations/bar.svg";
import comboEmptyState from "assets/img/empty-states/visualizations/combo.svg";
import funnelEmptyState from "assets/img/empty-states/visualizations/funnel.svg";
import gaugeEmptyState from "assets/img/empty-states/visualizations/gauge.svg";
import lineEmptyState from "assets/img/empty-states/visualizations/line.svg";
import mapEmptyState from "assets/img/empty-states/visualizations/map-region.svg";
import pieEmptyState from "assets/img/empty-states/visualizations/pie.svg";
import pivotEmptyState from "assets/img/empty-states/visualizations/pivot.svg";
import progressEmptyState from "assets/img/empty-states/visualizations/progress.svg";
import rowEmptyState from "assets/img/empty-states/visualizations/row.svg";
import sankeyEmptyState from "assets/img/empty-states/visualizations/sankey.svg";
import scalarEmptyState from "assets/img/empty-states/visualizations/scalar.svg";
import scatterEmptyState from "assets/img/empty-states/visualizations/scatter.svg";
import smartscalarEmptyState from "assets/img/empty-states/visualizations/smartscalar.svg";
import waterfallEmptyState from "assets/img/empty-states/visualizations/waterfall.svg";
import type { CardDisplayType } from "metabase-types/api";

/**
 * The "table" and the "object" (detail) charts can always display the data
 * using the raw table alone, so they don't need an empty state.
 */
export type ExcludedEmptyVizDisplayTypes = "table" | "object";
type SupportedDisplayType = Exclude<
  CardDisplayType,
  ExcludedEmptyVizDisplayTypes
>;

type EmptyVizConfig = {
  imgSrc: string;
  primaryText: string;
  secondaryText: string;
  docsLink?: string;
};

const emptyVizConfig: Record<SupportedDisplayType, EmptyVizConfig> = {
  area: {
    imgSrc: areaEmptyState,
    get primaryText() {
      return t`Then pick a metric and multiple columns to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of orders grouped by Year and Product category`;
    },
  },
  bar: {
    imgSrc: barEmptyState,
    get primaryText() {
      return t`Then pick a metric and a column to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of users grouped by Country`;
    },
  },
  combo: {
    imgSrc: comboEmptyState,
    get primaryText() {
      return t`Then pick two or more metrics and one or two columns to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of orders and Average rating grouped by Year`;
    },
  },
  funnel: {
    imgSrc: funnelEmptyState,
    get primaryText() {
      return t`Funnel charts visualize how a value is broken out by a series of steps, and the percent change between steps.`;
    },
    get secondaryText() {
      return t`Read the docs`;
    },
    docsLink: "questions/visualizations/funnel",
  },
  gauge: {
    imgSrc: gaugeEmptyState,
    get primaryText() {
      return t`Then pick an aggregate metric (such as Average or Sum) and customize the gauge in the visualization settings.`;
    },
    get secondaryText() {
      return t`E.g. Average star rating`;
    },
  },
  line: {
    imgSrc: lineEmptyState,
    get primaryText() {
      return t`Then pick one or more metrics and a time column to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of orders grouped by Year`;
    },
  },
  map: {
    imgSrc: mapEmptyState,
    get primaryText() {
      return t`Build map visualizations with geospatial data: Pin and Grid maps require longitude and latitude columns, Region maps require a US region names column.`;
    },
    get secondaryText() {
      return t`Read the docs`;
    },
    docsLink: "questions/visualizations/map",
  },
  pie: {
    imgSrc: pieEmptyState,
    get primaryText() {
      return t`Then pick a metric and a column to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of users grouped by Subscription plan`;
    },
  },
  pivot: {
    imgSrc: pivotEmptyState,
    get primaryText() {
      return t`Then pick an aggregate metric (such as Average or Sum) and multiple columns to group by.`;
    },
    get secondaryText() {
      return t`E.g. Count of orders grouped by State, Year, and Product category`;
    },
  },
  progress: {
    imgSrc: progressEmptyState,
    get primaryText() {
      return t`Then pick an aggregate metric (such as Count or Sum) and customize the progress bar in the visualization settings.`;
    },
    get secondaryText() {
      return t`E.g. Count of orders`;
    },
  },
  row: {
    imgSrc: rowEmptyState,
    get primaryText() {
      return t`Then pick a metric and a column to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of customers grouped by State`;
    },
  },
  sankey: {
    imgSrc: sankeyEmptyState,
    get primaryText() {
      return t`Sankey charts show how data flows through multi-dimensional steps. They're useful for showing which elements, called nodes, contribute to the overall flow.`;
    },
    get secondaryText() {
      return t`Read the docs`;
    },
    docsLink: "questions/visualizations/sankey",
  },
  scalar: {
    imgSrc: scalarEmptyState,
    get primaryText() {
      return t`Then pick an aggregate metric (such as Average or Sum).`;
    },
    secondaryText: `E.g. Average star rating`,
  },
  scatter: {
    imgSrc: scatterEmptyState,
    get primaryText() {
      return t`Then pick a metric and a number columns to group by.`;
    },
    get secondaryText() {
      return t`E.g. Count of orders grouped by Customer age`;
    },
  },
  smartscalar: {
    imgSrc: smartscalarEmptyState,
    get primaryText() {
      return t`Then pick an aggregate metric (such as the Average or Sum) and a time column to group by.`;
    },
    get secondaryText() {
      return t`E.g. Count of orders grouped by Month`;
    },
  },
  waterfall: {
    imgSrc: waterfallEmptyState,
    get primaryText() {
      return t`Then pick a metric and a single column to group by: either time or category.`;
    },
    get secondaryText() {
      return t`E.g. Sum of revenue grouped by Country`;
    },
  },
};

export const getEmptyVizConfig = (
  chartType: SupportedDisplayType,
): EmptyVizConfig | Record<string, never> => {
  return emptyVizConfig[chartType];
};
