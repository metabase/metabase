import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackExplainChartClicked = () => {
  trackSimpleEvent({
    event: "metabot_explain_chart_clicked",
  });
};
