import { t } from "ttag";

import { Icon, Popover, Stack, Switch, Text } from "metabase/ui";

import { useGitIntegrationEnabled } from "./use-git-integration-enabled";
import { useTenantsEnabled } from "./use-tenants-enabled";

/**
 * PROTOTYPE: switches for simulating app states while reviewing the prototype.
 * Lives at the right end of the variant picker, styled as picker chrome.
 */
export function PrototypeControls() {
  const gitIntegration = useGitIntegrationEnabled();
  const tenants = useTenantsEnabled();

  return (
    <Popover position="top-end" offset={12} shadow="md">
      <Popover.Target>
        <button
          type="button"
          className="proto-picker-item proto-picker-controls"
          aria-label={t`Prototype controls`}
        >
          <Icon name="gear" size={14} />
        </button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="md" p="md" w={280}>
          <Text fw={700}>{t`Prototype controls`}</Text>
          <Switch
            label={t`Git integration`}
            description={
              gitIntegration.isConnected
                ? t`Simulated: turning this off only hides the git integration UI.`
                : t`Connect a repository in Admin settings to turn this on.`
            }
            checked={gitIntegration.isEnabled}
            disabled={!gitIntegration.isConnected}
            onChange={(event) =>
              gitIntegration.setIsSimulatedOn(event.currentTarget.checked)
            }
          />
          <Switch
            label={t`Tenants`}
            description={
              tenants.isReal
                ? t`Simulated: turning this off only hides the tenants UI.`
                : t`Simulated: tenants are off on this instance, so the nav shows mocked external collections.`
            }
            checked={tenants.isEnabled}
            onChange={(event) =>
              tenants.setIsSimulatedOn(event.currentTarget.checked)
            }
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
