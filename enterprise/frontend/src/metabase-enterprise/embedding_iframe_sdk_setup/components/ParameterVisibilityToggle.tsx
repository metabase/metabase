import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";

import type { EmbedType } from "../types";

interface ParameterVisibilityToggleProps {
  parameterId: string;
  embedType: EmbedType;
  isHidden: boolean;
  onToggle: (parameterId: string) => void;
}

export const ParameterVisibilityToggle = ({
  parameterId,
  embedType,
  isHidden,
  onToggle,
}: ParameterVisibilityToggleProps) => {
  // Only show toggle for dashboards
  if (embedType !== "dashboard") {
    return null;
  }

  const tooltipLabel = isHidden ? t`Show parameter` : t`Hide parameter`;
  const iconName = isHidden ? "eye_crossed_out" : "eye";

  return (
    <Tooltip label={tooltipLabel}>
      <ActionIcon
        variant="subtle"
        onClick={() => onToggle(parameterId)}
        title={tooltipLabel}
      >
        <Icon name={iconName} size={16} />
      </ActionIcon>
    </Tooltip>
  );
};
