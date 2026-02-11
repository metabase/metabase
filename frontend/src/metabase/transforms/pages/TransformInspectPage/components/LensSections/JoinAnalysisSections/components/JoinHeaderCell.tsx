import { match } from "ts-pattern";

import { ActionIcon, Icon } from "metabase/ui";
import type { TriggeredAlert } from "metabase-lib/transforms-inspector";
import type { InspectorCard } from "metabase-types/api";

import { useLensCardLoader } from "../../../../hooks";

type JoinHeaderCellProps = {
  card: InspectorCard;
  severity: TriggeredAlert["severity"] | null;
  onToggleAlerts?: () => void;
};

export const JoinHeaderCell = ({
  card,
  severity,
  onToggleAlerts,
}: JoinHeaderCellProps) => {
  useLensCardLoader({ card });
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
