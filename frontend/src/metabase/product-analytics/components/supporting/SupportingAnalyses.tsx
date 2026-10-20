import { t } from "ttag";

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
  const { funnel, paths, cohorts, lifecycle } = supporting;
  if (cohorts !== undefined) {
    return <RetentionCurvesPanel cohorts={cohorts} />;
  }
  if (lifecycle !== undefined) {
    return (
      <InsightsPanel
        insights={lifecycle.insights}
        focus={undefined}
        idleLabel={t`Finish setting up the lifecycle to see insights.`}
      />
    );
  }
  if (paths !== undefined) {
    return (
      <>
        <PathStepsPanel steps={paths.steps} />
        {paths.insights !== undefined && (
          <InsightsPanel
            insights={paths.insights}
            focus={undefined}
            idleLabel={t`Start the paths at the start of a visit to see insights.`}
          />
        )}
      </>
    );
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
        idleLabel={t`Finish setting up the funnel to see insights.`}
      />
    </>
  );
};
