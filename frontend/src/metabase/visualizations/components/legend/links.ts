import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import type { VisualizationProps } from "metabase/visualizations/types";

type CanLinkLegendSeriesOpts = Pick<
  VisualizationProps,
  "getHref" | "onChangeCardAndRun" | "isDashboard"
> & {
  hasMultipleCards: boolean;
  hasBreakout: boolean;
};

/**
 * Whether a chart's legend series titles should render as links: true when
 * clicking a title always opens a question. Breakout series can open drills
 * instead, so a single card with a breakout is never linked.
 */
export function canLinkLegendSeries({
  getHref,
  onChangeCardAndRun,
  isDashboard,
  hasMultipleCards,
  hasBreakout,
}: CanLinkLegendSeriesOpts): boolean {
  // In the Embedding SDK internal links lead nowhere.
  const canNavigate =
    getHref != null && onChangeCardAndRun != null && !isEmbeddingSdk();

  return canNavigate && (hasMultipleCards || (isDashboard && !hasBreakout));
}
