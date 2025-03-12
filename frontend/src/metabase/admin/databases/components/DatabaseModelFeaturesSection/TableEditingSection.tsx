import { useState } from "react";
import { t } from "ttag";

import Toggle from "metabase/core/components/Toggle";
import { getResponseErrorMessage } from "metabase/lib/errors";
import { Box, Flex } from "metabase/ui";

import { Description, Error, Label } from "./ModelFeatureToggles.styled";

export interface ModelActionsSectionProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => Promise<void>;
}

export function TableEditingSection({
  isEnabled,
  onToggle,
}: ModelActionsSectionProps) {
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (enabled: boolean) => {
    try {
      setError(null);
      await onToggle(enabled);
    } catch (err) {
      setError(getResponseErrorMessage(err) || t`An error occurred`);
    }
  };

  return (
    <div>
      <Flex align="center" justify="space-between" mb="xs">
        <Label htmlFor="table-editing-toggle">{t`Editable tables`}</Label>
        <Toggle
          id="table-editing-toggle"
          value={isEnabled}
          onChange={handleToggle}
        />
      </Flex>
      <Box maw="22.5rem">
        {error ? <Error>{error}</Error> : null}
        <Description>
          {t`Allow tables in this database to be edited by Admin users. Your database connection will need Write permissions.`}
        </Description>
      </Box>
    </div>
  );
}
