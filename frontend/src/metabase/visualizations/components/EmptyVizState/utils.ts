import { t } from "ttag";

import { getSubpathSafeUrl } from "metabase/lib/urls";
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

// We should not import these large empty-state images directly,
// because we don't need to inline them as base64 to the SDK bundle.
// Instead we just define paths to them that is passed to the <img> tag directly.
const emptyVizConfig: Record<SupportedDisplayType, EmptyVizConfig> = {
  area: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/area.svg",
      );
    },
    get primaryText() {
      return t`Then pick a metric and multiple columns to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of orders grouped by Year and Product category`;
    },
  },
  bar: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/bar.svg",
      );
    },
    get primaryText() {
      return t`Then pick a metric and a column to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of users grouped by Country`;
    },
  },
  combo: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/combo.svg",
      );
    },
    get primaryText() {
      return t`Then pick two or more metrics and one or two columns to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of orders and Average rating grouped by Year`;
    },
  },
  funnel: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/funnel.svg",
      );
    },
    get primaryText() {
      return t`Funnel charts visualize how a value is broken out by a series of steps, and the percent change between steps.`;
    },
    get secondaryText() {
      return t`Read the docs`;
    },
    docsLink: getSubpathSafeUrl("questions/visualizations/funnel"),
  },
  gauge: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/gauge.svg",
      );
    },
    get primaryText() {
      return t`Then pick an aggregate metric (such as Average or Sum) and customize the gauge in the visualization settings.`;
    },
    get secondaryText() {
      return t`E.g. Average star rating`;
    },
  },
  line: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/line.svg",
      );
    },
    get primaryText() {
      return t`Then pick one or more metrics and a time column to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of orders grouped by Year`;
    },
  },
  map: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/map-region.svg",
      );
    },
    get primaryText() {
      return t`Build map visualizations with geospatial data: Pin and Grid maps require longitude and latitude columns, Region maps require a column with region names.`;
    },
    get secondaryText() {
      return t`Read the docs`;
    },
    docsLink: "questions/visualizations/map",
  },
  pie: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/pie.svg",
      );
    },
    get primaryText() {
      return t`Then pick a metric and a column to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of users grouped by Subscription plan`;
    },
  },
  pivot: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/pivot.svg",
      );
    },
    get primaryText() {
      return t`Then pick an aggregate metric (such as Average or Sum) and multiple columns to group by.`;
    },
    get secondaryText() {
      return t`E.g. Count of orders grouped by State, Year, and Product category`;
    },
  },
  progress: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/progress.svg",
      );
    },
    get primaryText() {
      return t`Then pick an aggregate metric (such as Count or Sum) and customize the progress bar in the visualization settings.`;
    },
    get secondaryText() {
      return t`E.g. Count of orders`;
    },
  },
  row: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/row.svg",
      );
    },
    get primaryText() {
      return t`Then pick a metric and a column to group by.`;
    },
    get secondaryText() {
      return t`E.g., Count of customers grouped by State`;
    },
  },
  sankey: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/sankey.svg",
      );
    },
    get primaryText() {
      return t`Sankey charts show how data flows through multi-dimensional steps. They're useful for showing which elements, called nodes, contribute to the overall flow.`;
    },
    get secondaryText() {
      return t`Read the docs`;
    },
    docsLink: "questions/visualizations/sankey",
  },
  scalar: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/scalar.svg",
      );
    },
    get primaryText() {
      return t`Then pick an aggregate metric (such as Average or Sum).`;
    },
    secondaryText: `E.g. Average star rating`,
  },
  scatter: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/scatter.svg",
      );
    },
    get primaryText() {
      return t`Then pick a metric and a number columns to group by.`;
    },
    get secondaryText() {
      return t`E.g. Count of orders grouped by Customer age`;
    },
  },
  smartscalar: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/smartscalar.svg",
      );
    },
    get primaryText() {
      return t`Then pick an aggregate metric (such as the Average or Sum) and a time column to group by.`;
    },
    get secondaryText() {
      return t`E.g. Count of orders grouped by Month`;
    },
  },
  waterfall: {
    get imgSrc() {
      return getSubpathSafeUrl(
        "app/assets/img/empty-states/visualizations/waterfall.svg",
      );
    },
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
