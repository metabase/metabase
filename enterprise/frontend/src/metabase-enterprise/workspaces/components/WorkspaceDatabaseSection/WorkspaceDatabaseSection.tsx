import { useState } from "react";
import { t } from "ttag";

import {
  Description,
  Error,
  Label,
} from "metabase/admin/databases/components/DatabaseFeatureComponents";
import { DatabaseInfoSection } from "metabase/admin/databases/components/DatabaseInfoSection";
import { getErrorMessage } from "metabase/api/utils/errors";
import { hasDbRoutingEnabled } from "metabase/common/utils/database";
import type { WorkspaceDatabaseSectionProps } from "metabase/plugins";
import { Alert, Box, Flex, Icon, Switch } from "metabase/ui";

const WORKSPACES_SETTING = "database-enable-workspaces";
const DRIVER_FEATURE_MISSING = "driver-feature-missing";

/**
 * The Workspaces section of a database's admin page. Renders nothing when the token lacks workspaces (the
 * setting is absent from `settingsAvailable`) or the database's driver does not support them.
 */
export function WorkspaceDatabaseSection({
  database,
  settingsAvailable,
  updateDatabase,
}: WorkspaceDatabaseSectionProps) {
  const [error, setError] = useState<string | null>(null);

  const availability = settingsAvailable?.[WORKSPACES_SETTING];
  if (availability === undefined) {
    return null;
  }

  const disabledReason = availability.enabled
    ? undefined
    : availability.reasons[0];
  if (disabledReason?.key === DRIVER_FEATURE_MISSING) {
    return null;
  }

  const isEnabled = database.settings?.[WORKSPACES_SETTING] ?? false;
  const isRoutingEnabled = hasDbRoutingEnabled(database);
  const isSwitchDisabled =
    disabledReason !== undefined || (!isEnabled && isRoutingEnabled);

  const handleToggle = async (enabled: boolean) => {
    setError(null);
    try {
      await updateDatabase({
        id: database.id,
        settings: { [WORKSPACES_SETTING]: enabled },
      });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <DatabaseInfoSection
      name={t`Workspaces`}
      description={t`Allow isolated workspaces on this database. They're created externally via the API, and each one gets its own schema and warehouse user.`}
      data-testid="workspace-database-section"
    >
      <Flex align="center" justify="space-between" mb="xxs">
        <Label htmlFor="workspaces-toggle">{t`Enable workspaces`}</Label>
        <Switch
          id="workspaces-toggle"
          checked={isEnabled}
          disabled={isSwitchDisabled}
          onChange={(event) => handleToggle(event.currentTarget.checked)}
        />
      </Flex>
      <Box maw="22.5rem">
        {error && <Error>{error}</Error>}
        {disabledReason && <Description>{disabledReason.message}</Description>}
      </Box>

      {isRoutingEnabled && (
        <Alert
          size="compact"
          variant="light"
          icon={<Icon name="info" />}
          mt="md"
        >
          {t`Workspaces can't be enabled when database routing is enabled.`}
        </Alert>
      )}
    </DatabaseInfoSection>
  );
}
