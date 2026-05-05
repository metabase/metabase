import { match } from "ts-pattern";

import { trackTransformInspectAlertClicked } from "metabase/transforms/analytics";
import { ActionIcon, Icon } from "metabase/ui";
import type {
  InspectorAlertTrigger,
  InspectorCard,
  TransformId,
} from "metabase-types/api";

import { useLensCardLoader } from "../../../../hooks";

type JoinHeaderCellProps = {
  card: InspectorCard;
  severity: InspectorAlertTrigger["severity"] | null;
  transformId: TransformId;
  onToggleAlerts?: () => void;
  isExpanded: boolean;
};

export const JoinHeaderCell = ({
  card,
  severity,
  transformId,
  onToggleAlerts,
  isExpanded,
}: JoinHeaderCellProps) => {
  useLensCardLoader({ card });
  if (!severity) {
    return null;
  }

  return (
    <ActionIcon
      variant={match(severity)
        .with("error", () => "error" as const)
        .with("warning", () => "warning" as const)
        .with("info", () => "info" as const)
        .otherwise(() => "subtle" as const)}
      size="lg"
      data-is-active={isExpanded}
      onClick={(e) => {
        e.stopPropagation();
        trackTransformInspectAlertClicked({ transformId, cardId: card.id });
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
