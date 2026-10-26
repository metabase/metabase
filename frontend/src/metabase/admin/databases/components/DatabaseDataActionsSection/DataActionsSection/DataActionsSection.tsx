import { useState } from "react";
import { t } from "ttag";

import { findErrorMessage } from "metabase/api/utils/errors";
import { Box, Flex, Switch } from "metabase/ui";

import { Description, Error, Label } from "../../DatabaseFeatureComponents";

export interface DataActionsSectionProps {
  hasDataActionsEnabled: boolean;
  onToggleDataActionsEnabled: (enabled: boolean) => Promise<void>;
}

export function DataActionsSection({
  hasDataActionsEnabled,
  onToggleDataActionsEnabled,
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
          />
        </Box>
      </Flex>
      <Box maw="22.5rem">
        {error ? <Error>{error}</Error> : null}
        <Description>
          {t`Allow data actions that use this database to be run. Actions are able to read, write, and possibly delete data.`}
        </Description>
      </Box>
    </div>
  );
}
