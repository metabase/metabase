import React from "react";
import { t } from "ttag";

import Toggle from "metabase/core/components/Toggle";

import {
  ToggleContainer,
  Label,
  Description,
} from "./ModelActionsSection.styled";

interface ModelActionsSectionProps {
  hasActionsEnabled: boolean;
  onToggleActionsEnabled: (enabled: boolean) => void;
}

function ModelActionsSection({
  hasActionsEnabled,
  onToggleActionsEnabled,
}: ModelActionsSectionProps) {
  return (
    <div>
      <ToggleContainer>
        <Label htmlFor="model-actions-toggle">{t`Model actions`}</Label>
        <Toggle
          id="model-actions-toggle"
          value={hasActionsEnabled}
          onChange={onToggleActionsEnabled}
        />
      </ToggleContainer>
      <Description>{t`Allow actions from models created from this data to be run. Actions are able to read, write, and possibly delete data.`}</Description>
      <Description>{t`Note: Your database user will need write permissions.`}</Description>
    </div>
  );
}

export default ModelActionsSection;
