/* @flow */

import { drillDownForDimensions } from "metabase/modes/lib/actions";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase-types/types/Visualization";
import { t } from "ttag";

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
