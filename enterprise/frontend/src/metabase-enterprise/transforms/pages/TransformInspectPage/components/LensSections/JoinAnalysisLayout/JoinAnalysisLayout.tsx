import { useMemo } from "react";

import { Stack } from "metabase/ui";
import type {
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type { InspectorCard } from "metabase-types/api";

import type { CardStats, LensRef } from "../../../types";
import { BaseCountDisplay, JoinStepRow } from "../../LensCards";

type JoinAnalysisLayoutProps = {
  cards: InspectorCard[];
  alerts: TriggeredAlert[];
  drillTriggers: TriggeredDrillLens[];
  onStatsReady: (cardId: string, stats: CardStats) => void;
  onDrill: (lensRef: LensRef) => void;
};

export const JoinAnalysisLayout = ({
  cards,
  alerts,
  drillTriggers,
  onStatsReady,
  onDrill,
}: JoinAnalysisLayoutProps) => {
  const baseCountCard = cards.find(
    (c) => c.metadata?.card_type === "base-count" || c.id === "base-count",
  );
  const joinStepCards = cards.filter(
    (c) =>
      c.metadata?.card_type === "join-step" || c.id.startsWith("join-step-"),
  );
  const tableCountCards = cards.filter(
    (c) => c.metadata?.card_type === "table-count" || c.id.startsWith("table-"),
  );

  const sortedJoinSteps = useMemo(
    () =>
      [...joinStepCards].sort((a, b) => {
        const stepA = (a.metadata?.join_step as number) ?? 0;
        const stepB = (b.metadata?.join_step as number) ?? 0;
        return stepA - stepB;
      }),
    [joinStepCards],
  );

  return (
    <Stack gap="md">
      {baseCountCard && (
        <BaseCountDisplay
          card={baseCountCard}
          alerts={alerts}
          drillTriggers={drillTriggers}
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
              <JoinStepRow
                key={card.id}
                stepCard={card}
                tableCard={tableCard}
                alerts={alerts}
                drillTriggers={drillTriggers}
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
