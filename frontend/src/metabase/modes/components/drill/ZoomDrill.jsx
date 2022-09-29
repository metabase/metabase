import { t } from "ttag";
import { drillDownForDimensions } from "metabase/modes/lib/actions";

export default ({ question, clicked }) => {
  if (!question.query().isEditable()) {
    return [];
  }

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
      buttonType: "horizontal",
      icon: "zoom_in",
      question: () => question.pivot(drilldown.breakouts, dimensions),
    },
  ];
};
