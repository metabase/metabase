import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";

import type { SdkIframeEmbedSetupType } from "../types";

interface ParameterVisibilityToggleProps {
  parameterName: string;
  embedType: SdkIframeEmbedSetupType;
  isHidden: boolean;
  onToggle: (parameterName: string) => void;
}

export const ParameterVisibilityToggle = ({
  parameterName,
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
        onClick={() => onToggle(parameterName)}
        title={tooltipLabel}
      >
        <Icon name={iconName} size={16} />
      </ActionIcon>
    </Tooltip>
  );
};
