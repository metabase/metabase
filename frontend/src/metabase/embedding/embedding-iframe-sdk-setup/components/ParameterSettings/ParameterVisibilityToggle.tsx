import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";

import type { SdkIframeEmbedSetupExperience } from "../../types";

interface ParameterVisibilityToggleProps {
  parameterName: string;
  experience: SdkIframeEmbedSetupExperience;
  isHidden: boolean;
  onToggle: (parameterName: string) => void;
}

export const ParameterVisibilityToggle = ({
  parameterName,
  experience,
  isHidden,
  onToggle,
}: ParameterVisibilityToggleProps) => {
  // Only show toggle for dashboards at the moment
  if (experience !== "dashboard") {
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
        data-testid="parameter-visibility-toggle"
        data-hidden={isHidden}
        data-parameter-slug={parameterName}
      >
        <Icon name={iconName} size={16} />
      </ActionIcon>
    </Tooltip>
  );
};
