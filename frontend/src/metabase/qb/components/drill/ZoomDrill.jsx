/* @flow */

import { drillDownForDimensions } from "metabase/qb/lib/actions";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";
import { t } from "c-3po";

export default ({
  question,
  clicked,
  settings,
}: ClickActionProps): ClickAction[] => {
  const dimensions = (clicked && clicked.dimensions) || [];
  const drilldown = drillDownForDimensions(dimensions, question.metadata());
  if (!drilldown) {
    return [];
  }

  return [
    {
      name: "timeseries-zoom",
      section: "zoom",
      title: t`Zoom in`,
      question: () => question.pivot(drilldown.breakouts, dimensions),
    },
  ];
};
