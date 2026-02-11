import { match } from "ts-pattern";

import { ActionIcon, Icon } from "metabase/ui";
import type {
  CardStats,
  TriggeredAlert,
} from "metabase-lib/transforms-inspector";
import type { InspectorCard, InspectorLens } from "metabase-types/api";

import { useLensCardLoader } from "../../../../hooks";

type JoinHeaderCellProps = {
  lens: InspectorLens;
  card: InspectorCard;
  severity: TriggeredAlert["severity"] | null;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
  onToggleAlerts?: () => void;
};

export const JoinHeaderCell = ({
  lens,
  card,
  severity,
  onToggleAlerts,
  onStatsReady,
}: JoinHeaderCellProps) => {
  useLensCardLoader({ lensId: lens.id, card, onStatsReady });
  if (!severity) {
    return null;
  }
  return (
    <ActionIcon
      variant="transparent"
      color={match(severity)
        .with("error", () => "error" as const)
        .with("warning", () => "warning" as const)
        .with("info", () => "brand" as const)
        .exhaustive()}
      size="lg"
      onClick={(e) => {
        e.stopPropagation();
        onToggleAlerts?.();
      }}
    >
      <Icon
        name={match(severity)
          .with("error", "warning", () => "warning_round_filled" as const)
          .with("info", () => "info" as const)
          .exhaustive()}
      />
    </ActionIcon>
  );
};
