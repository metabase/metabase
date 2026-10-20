import type { SupportingAnalyses as SupportingAnalysesState } from "../../supporting/use-supporting-analyses";

import { FunnelPathsPanel } from "./FunnelPathsPanel";
import { InsightsPanel } from "./InsightsPanel";
import { PathStepsPanel } from "./PathStepsPanel";
import { RetentionCurvesPanel } from "./RetentionCurvesPanel";

type SupportingAnalysesProps = {
  supporting: SupportingAnalysesState;
};

/** The panels below the primary chart, in the order they're read. */
export const SupportingAnalyses = ({ supporting }: SupportingAnalysesProps) => {
  const { funnel, paths, cohorts } = supporting;
  if (cohorts !== undefined) {
    return <RetentionCurvesPanel cohorts={cohorts} />;
  }
  if (paths !== undefined) {
    return <PathStepsPanel steps={paths} />;
  }
  if (funnel === undefined) {
    return null;
  }
  return (
    <>
      {funnel.paths !== undefined && (
        <FunnelPathsPanel
          steps={funnel.paths.funnel.steps}
          range={funnel.paths.range}
          paths={funnel.paths.paths}
          focusId={funnel.paths.focusId}
          onChangeRange={funnel.paths.onChangeRange}
        />
      )}
      <InsightsPanel
        insights={funnel.insights.insights}
        focus={funnel.insights.focus}
      />
    </>
  );
};
