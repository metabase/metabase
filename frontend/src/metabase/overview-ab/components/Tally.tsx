import { useMemo } from "react";
import { t } from "ttag";

import type {
  OverviewJudgement,
  OverviewJudgementAxis,
  OverviewJudgementVerdict,
} from "metabase/api";
import { Text } from "metabase/ui";

import { OVERVIEW_VERDICTS, getVerdictLabel } from "../types";

type TallyProps = {
  judgements: OverviewJudgement[] | undefined;
};

function countByVerdict(judgements: OverviewJudgement[]) {
  const counts = new Map<OverviewJudgementVerdict, number>();
  for (const judgement of judgements) {
    counts.set(judgement.verdict, (counts.get(judgement.verdict) ?? 0) + 1);
  }
  return OVERVIEW_VERDICTS.map(
    (verdict) => `${getVerdictLabel(verdict)} ${counts.get(verdict) ?? 0}`,
  ).join(" / ");
}

function getAxisLabel(axis: OverviewJudgementAxis): string {
  return axis === "generation" ? t`Gen` : t`Viz`;
}

export function Tally({ judgements }: TallyProps) {
  const summary = useMemo(() => {
    const all = judgements ?? [];
    const axes: OverviewJudgementAxis[] = ["generation", "visualization"];
    return axes
      .map(
        (axis) =>
          `${getAxisLabel(axis)}: ${countByVerdict(all.filter((judgement) => judgement.axis === axis))}`,
      )
      .join(" · ");
  }, [judgements]);
  const total = judgements?.length ?? 0;

  return (
    <Text size="xs" c="text-secondary" data-testid="overview-ab-tally">
      {t`${total} judgements`} — {summary}
    </Text>
  );
}
