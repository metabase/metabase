import { useCallback, useEffect, useState } from "react";
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

  // Optimistic local state so the toggle flips immediately instead of snapping
  // back until the list refetch lands; re-synced whenever the server value changes.
  const [enabled, setLocalEnabled] = useState(app.enabled);
  useEffect(() => {
    setLocalEnabled(app.enabled);
  }, [app.enabled]);

  const handleToggle = useCallback(
    async (next: boolean) => {
      setLocalEnabled(next);
      try {
        await setEnabled({ name: app.name, enabled: next }).unwrap();
      } catch {
        setLocalEnabled(!next);
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
          checked={enabled}
          disabled={isLoading}
          onChange={(event) => handleToggle(event.currentTarget.checked)}
          size="sm"
        />
        <Button
          component={Link}
          to={`/data-app/${encodeURIComponent(app.name)}`}
          leftSection={<Icon name="external" />}
          variant="subtle"
          disabled={!enabled}
        >
          {t`Open`}
        </Button>
      </Group>
    </Flex>
  );
}
