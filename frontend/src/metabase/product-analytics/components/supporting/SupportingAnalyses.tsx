import type { SupportingAnalyses as SupportingAnalysesState } from "../../supporting/use-supporting-analyses";

import { FunnelPathsPanel } from "./FunnelPathsPanel";
import { PathStepsPanel } from "./PathStepsPanel";

type SupportingAnalysesProps = {
  supporting: SupportingAnalysesState;
};

/**
 * The panels below the primary chart, in the order they're read. Insights
 * live in their own side panel.
 */
export const SupportingAnalyses = ({ supporting }: SupportingAnalysesProps) => {
  const { funnel, paths } = supporting;
  if (paths !== undefined) {
    return <PathStepsPanel steps={paths.steps} />;
  }
  if (funnel?.paths === undefined) {
    return null;
  }
  return (
    <FunnelPathsPanel
      steps={funnel.paths.funnel.steps}
      range={funnel.paths.range}
      paths={funnel.paths.paths}
      focusId={funnel.paths.focusId}
      onChangeRange={funnel.paths.onChangeRange}
    />
  );
};
