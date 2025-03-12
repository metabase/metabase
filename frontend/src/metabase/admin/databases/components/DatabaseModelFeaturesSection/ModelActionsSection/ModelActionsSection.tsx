import { useState } from "react";
import { t } from "ttag";

import Toggle from "metabase/core/components/Toggle";
import { getResponseErrorMessage } from "metabase/lib/errors";
import { Box, Flex } from "metabase/ui";

import { Description, Error, Label } from "../ModelFeatureToggles";

export interface ModelActionsSectionProps {
  hasModelActionsEnabled: boolean;
  onToggleModelActionsEnabled: (enabled: boolean) => Promise<void>;
}

export function ModelActionsSection({
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
      <Flex align="center" justify="space-between" mb="xs">
        <Label htmlFor="model-actions-toggle">{t`Model actions`}</Label>
        <Toggle
          id="model-actions-toggle"
          value={hasModelActionsEnabled}
          onChange={handleToggleModelActionsEnabled}
        />
      </Flex>
      <Box maw="22.5rem">
        {error ? <Error>{error}</Error> : null}
        <Description>
          {t`Allow actions from models created from this data to be run. Actions are able to read, write, and possibly delete data.`}
          <br />
          {t`Note: Your database user will need write permissions.`}
        </Description>
      </Box>
    </div>
  );
}
