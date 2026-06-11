import { useCallback } from "react";
import { t } from "ttag";

import { useSetDataAppEnabledMutation } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { useToast } from "metabase/common/hooks";
import { Button, Flex, Group, Icon, Switch } from "metabase/ui";
import type { DataApp } from "metabase-types/api";

import { DataAppSummary } from "./DataAppSummary";

type Props = {
  app: DataApp;
};

export function DataAppListItem({ app }: Props) {
  const [setEnabled, { isLoading }] = useSetDataAppEnabledMutation();
  const [sendToast] = useToast();

  const handleToggle = useCallback(
    async (enabled: boolean) => {
      try {
        await setEnabled({ name: app.name, enabled }).unwrap();
      } catch {
        sendToast({ message: t`Failed to update this app`, icon: "warning" });
      }
    },
    [app.name, setEnabled, sendToast],
  );

  return (
    <Flex justify="space-between" align="center" gap="md" p="md">
      <DataAppSummary app={app} />

      <Group flex="0 0 auto" gap="md" wrap="nowrap">
        <Switch
          aria-label={t`Enable ${app.display_name}`}
          checked={app.enabled}
          disabled={isLoading}
          onChange={(event) => handleToggle(event.currentTarget.checked)}
          size="sm"
        />
        <Button
          component={Link}
          to={`/data-app/${encodeURIComponent(app.name)}`}
          leftSection={<Icon name="external" />}
          variant="subtle"
          disabled={!app.enabled}
        >
          {t`Open`}
        </Button>
      </Group>
    </Flex>
  );
}
