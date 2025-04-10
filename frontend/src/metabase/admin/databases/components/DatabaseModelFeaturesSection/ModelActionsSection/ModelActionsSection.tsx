import { useState } from "react";
import { t } from "ttag";

import { getResponseErrorMessage } from "metabase/lib/errors";
import { Box, Flex, Switch, Tooltip } from "metabase/ui";

import { Description, Error, Label } from "../../DatabaseFeatureComponents";

export interface ModelActionsSectionProps {
  hasModelActionsEnabled: boolean;
  onToggleModelActionsEnabled: (enabled: boolean) => Promise<void>;
  disabled: boolean;
}

export function ModelActionsSection({
  hasModelActionsEnabled,
  onToggleModelActionsEnabled,
  disabled,
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
        <Tooltip
          label={t`Model actions can not be enabled if database routing is enabled.`}
          disabled={!disabled}
        >
          <Box>
            <Switch
              id="model-actions-toggle"
              checked={hasModelActionsEnabled}
              onChange={(e) =>
                handleToggleModelActionsEnabled(e.currentTarget.checked)
              }
              disabled={disabled}
            />
          </Box>
        </Tooltip>
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
