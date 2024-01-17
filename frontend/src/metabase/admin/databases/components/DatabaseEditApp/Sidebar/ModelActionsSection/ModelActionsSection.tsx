import { useState } from "react";
import { t } from "ttag";

import Toggle from "metabase/core/components/Toggle";
import { getResponseErrorMessage } from "metabase/lib/errors";

import {
  ToggleContainer,
  Label,
  Description,
  Error,
} from "./ModelActionsSection.styled";

export interface ModelActionsSectionProps {
  hasModelActionsEnabled: boolean;
  onToggleModelActionsEnabled: (enabled: boolean) => Promise<void>;
}

function ModelActionsSection({
  hasModelActionsEnabled,
  onToggleModelActionsEnabled,
}: ModelActionsSectionProps) {
  const [error, setError] = useState<string | null>(null);

  const handleToggleModelActionsEnabled = async (enabled: boolean) => {
    try {
      setError(null);
      await onToggleModelActionsEnabled(enabled);
    } catch (err) {
      setError(getResponseErrorMessage(err) || t`An error occurred`);
    }
  };

  return (
    <div>
      <ToggleContainer>
        <Label htmlFor="model-actions-toggle">{t`Model actions`}</Label>
        <Toggle
          id="model-actions-toggle"
          value={hasModelActionsEnabled}
          onChange={handleToggleModelActionsEnabled}
        />
      </ToggleContainer>
      {error ? <Error>{error}</Error> : null}
      <Description>{t`Allow actions from models created from this data to be run. Actions are able to read, write, and possibly delete data.`}</Description>
      <Description>{t`Note: Your database user will need write permissions.`}</Description>
    </div>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelActionsSection;
