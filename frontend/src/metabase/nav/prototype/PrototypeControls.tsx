import { t } from "ttag";

import { ActionIcon, Icon, Popover, Stack, Switch, Text } from "metabase/ui";

import { useGitIntegrationEnabled } from "./use-git-integration-enabled";

/** PROTOTYPE: switches for simulating app states while reviewing the prototype. */
export function PrototypeControls() {
  const { isEnabled, isConnected, setIsSimulatedOn } =
    useGitIntegrationEnabled();

  return (
    <Popover position="top-start" shadow="md">
      <Popover.Target>
        <ActionIcon variant="subtle" aria-label={t`Prototype controls`}>
          <Icon name="gear" />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="md" p="md" w={280}>
          <Text fw={700}>{t`Prototype controls`}</Text>
          <Switch
            label={t`Git integration`}
            description={
              isConnected
                ? t`Simulated: turning this off only hides the git integration UI.`
                : t`Connect a repository in Admin settings to turn this on.`
            }
            checked={isEnabled}
            disabled={!isConnected}
            onChange={(event) => setIsSimulatedOn(event.currentTarget.checked)}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
