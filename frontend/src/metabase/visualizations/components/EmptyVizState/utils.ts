import { t } from "ttag";

import areaImage from "assets/img/empty-states/visualizations/area.svg?url";
import barImage from "assets/img/empty-states/visualizations/bar.svg?url";
import comboImage from "assets/img/empty-states/visualizations/combo.svg?url";
import funnelImage from "assets/img/empty-states/visualizations/funnel.svg?url";
import gaugeImage from "assets/img/empty-states/visualizations/gauge.svg?url";
import lineImage from "assets/img/empty-states/visualizations/line.svg?url";
import mapRegionImage from "assets/img/empty-states/visualizations/map-region.svg?url";
import pieImage from "assets/img/empty-states/visualizations/pie.svg?url";
import pivotImage from "assets/img/empty-states/visualizations/pivot.svg?url";
import progressImage from "assets/img/empty-states/visualizations/progress.svg?url";
import rowImage from "assets/img/empty-states/visualizations/row.svg?url";
import sankeyImage from "assets/img/empty-states/visualizations/sankey.svg?url";
import scalarImage from "assets/img/empty-states/visualizations/scalar.svg?url";
import scatterImage from "assets/img/empty-states/visualizations/scatter.svg?url";
import smartscalarImage from "assets/img/empty-states/visualizations/smartscalar.svg?url";
import treemapImage from "assets/img/empty-states/visualizations/treemap.svg?url";
import waterfallImage from "assets/img/empty-states/visualizations/waterfall.svg?url";
import { getSubpathSafeUrl } from "metabase/urls";
import type { CardDisplayType } from "metabase-types/api";

/**
 * The "table" and the "object" (detail) charts can always display the data
 * using the raw table alone, so they don't need an empty state.
 */
export type ExcludedEmptyVizDisplayTypes =
  | "table"
  | "list"
  | "object"
  | "boxplot";
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
    imgSrc: areaImage,
    get primaryText() {
      return t`Then pick a metric and multiple columns to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of orders grouped by Year and Product category`;
    },
  },
  bar: {
    imgSrc: barImage,
    get primaryText() {
      return t`Then pick a metric and a column to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of users grouped by Country`;
    },
  },
  combo: {
    imgSrc: comboImage,
    get primaryText() {
      return t`Then pick two or more metrics and one or two columns to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of orders and Average rating grouped by Year`;
    },
  },
  funnel: {
    imgSrc: funnelImage,
    get primaryText() {
      return t`Funnel charts visualize how a value is broken out by a series of steps, and the percent change between steps.`;
    },
    get secondaryText() {
      return t`Read the docs`;
    },
    docsLink: getSubpathSafeUrl("questions/visualizations/funnel"),
  },
  gauge: {
    imgSrc: gaugeImage,
    get primaryText() {
      return t`Then pick an aggregate metric (such as Average or Sum) and customize the gauge in the visualization settings.`;
    },
    get secondaryText() {
      return t`E.g. Average star rating`;
    },
  },
  line: {
    imgSrc: lineImage,
    get primaryText() {
      return t`Then pick one or more metrics and a time column to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of orders grouped by Year`;
    },
  },
  map: {
    imgSrc: mapRegionImage,
    get primaryText() {
      return t`Build map visualizations with geospatial data: Pin and Grid maps require longitude and latitude columns, Region maps require a column with region names.`;
    },
    get secondaryText() {
      return t`Read the docs`;
    },
    docsLink: "questions/visualizations/map",
  },
  pie: {
    imgSrc: pieImage,
    get primaryText() {
      return t`Then pick a metric and a column to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of users grouped by Subscription plan`;
    },
  },
  pivot: {
    imgSrc: pivotImage,
    get primaryText() {
      return t`Then pick an aggregate metric (such as Average or Sum) and multiple columns to group by.`;
    },
    get secondaryText() {
      return t`E.g. Count of orders grouped by State, Year, and Product category`;
    },
  },
  progress: {
    imgSrc: progressImage,
    get primaryText() {
      return t`Then pick an aggregate metric (such as Count or Sum) and customize the progress bar in the visualization settings.`;
    },
    get secondaryText() {
      return t`E.g. Count of orders`;
    },
  },
  row: {
    imgSrc: rowImage,
    get primaryText() {
      return t`Then pick a metric and a column to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of customers grouped by State`;
    },
  },
  sankey: {
    imgSrc: sankeyImage,
    get primaryText() {
      return t`Sankey charts show how data flows through multi-dimensional steps. They're useful for showing which elements, called nodes, contribute to the overall flow.`;
    },
    get secondaryText() {
      return t`Read the docs`;
    },
    docsLink: "questions/visualizations/sankey",
  },
  scalar: {
    imgSrc: scalarImage,
    get primaryText() {
      return t`Then pick an aggregate metric (such as Average or Sum).`;
    },
    secondaryText: `E.g. Average star rating`,
  },
  scatter: {
    imgSrc: scatterImage,
    get primaryText() {
      return t`Then pick one or more metrics and a column to group by.`;
    },
    get secondaryText() {
      return t`E.g. Count of orders and Sum of revenue grouped by Product category`;
    },
  },
  smartscalar: {
    imgSrc: smartscalarImage,
    get primaryText() {
      return t`Then pick an aggregate metric (such as the Average or Sum) and a time column to group by.`;
    },
    get secondaryText() {
      return t`E.g. Count of orders grouped by Month`;
    },
  },
  treemap: {
    imgSrc: treemapImage,
    get primaryText() {
      return t`Then pick a metric and one or two columns to group by.`;
    },
    get secondaryText() {
      return t`E.g., Revenue grouped by Region and Country`;
    },
  },
  waterfall: {
    imgSrc: waterfallImage,
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
