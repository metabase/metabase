import { useState } from "react";
import { t } from "ttag";

import { findErrorMessage } from "metabase/api/utils/errors";
import { Alert, Box, Flex, Icon, Switch } from "metabase/ui";

import { Description, Error, Label } from "../../DatabaseFeatureComponents";

export interface DataActionsSectionProps {
  hasDataActionsEnabled: boolean;
  onToggleDataActionsEnabled: (enabled: boolean) => Promise<void>;
  disabled: boolean;
}

export function DataActionsSection({
  hasDataActionsEnabled,
  onToggleDataActionsEnabled,
  disabled,
}: DataActionsSectionProps) {
  const [error, setError] = useState<string | null>(null);

  const handleToggleDataActionsEnabled = async (enabled: boolean) => {
    try {
      setError(null);
      await onToggleDataActionsEnabled(enabled);
    } catch (err) {
      setError(findErrorMessage(err) || t`An error occurred`);
    }
  };

  return (
    <div>
      <Flex align="center" justify="space-between" mb="xxs">
        <Label htmlFor="data-actions-toggle">{t`Data actions`}</Label>
        <Box>
          <Switch
            id="data-actions-toggle"
            checked={hasDataActionsEnabled}
            onChange={(e) =>
              handleToggleDataActionsEnabled(e.currentTarget.checked)
            }
            disabled={disabled}
          />
        </Box>
      </Flex>
      <Box maw="22.5rem">
        {error ? <Error>{error}</Error> : null}
        <Description>
          {t`Allow data actions that use this database to be run. Actions are able to read, write, and possibly delete data.`}
        </Description>
      </Box>
      {disabled && (
        <Box>
          <Alert
            size="compact"
            variant="light"
            icon={<Icon name="info" />}
            mb="lg"
          >
            {t`Data actions can't be enabled when database routing is enabled.`}
          </Alert>
        </Box>
      )}
    </div>
  );
}
