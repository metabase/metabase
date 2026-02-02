import { useMemo } from "react";
import _ from "underscore";

import { Stack } from "metabase/ui";
import type {
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type { InspectorCard, InspectorLens } from "metabase-types/api";

import type { CardStats, LensRef } from "../../../types";

import { BaseCountDisplayCard } from "./components/BaseCountDisplayCard";
import { JoinStepRowCard } from "./components/JoinStepRowCard";

type JoinAnalysisSectionProps = {
  lens: InspectorLens;
  cards: InspectorCard[];
  alerts: TriggeredAlert[];
  drillLenses: TriggeredDrillLens[];
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
  onDrill: (lensRef: LensRef) => void;
};

export const JoinAnalysisSection = ({
  lens,
  cards,
  alerts,
  drillLenses,
  onStatsReady,
  onDrill,
}: JoinAnalysisSectionProps) => {
  const baseCountCard = cards.find((c) => c.id === "base-count");
  const joinStepCards = cards.filter((c) => c.id.startsWith("join-step-"));
  const tableCountCards = cards.filter((c) => /^table-.*-count$/.test(c.id));

  const sortedJoinSteps = useMemo(
    () => _.sortBy(joinStepCards, (card) => card.metadata?.join_step),
    [joinStepCards],
  );

  return (
    <Stack gap="md">
      {baseCountCard && (
        <BaseCountDisplayCard
          lensId={lens.id}
          card={baseCountCard}
          alerts={alerts}
          drillLenses={drillLenses}
          onStatsReady={onStatsReady}
          onDrill={onDrill}
        />
      )}
      {sortedJoinSteps.length > 0 && (
        <Stack gap="sm">
          {sortedJoinSteps.map((card) => {
            const tableCard = tableCountCards.find(
              (card) => card.metadata?.join_step === card.metadata?.join_step,
            );
            return (
              <JoinStepRowCard
                key={card.id}
                lensId={lens.id}
                card={card}
                tableCard={tableCard}
                alerts={alerts}
                drillLenses={drillLenses}
                onStatsReady={onStatsReady}
                onDrill={onDrill}
              />
            );
          })}
        </Stack>
      )}
    </Stack>
  );
};
