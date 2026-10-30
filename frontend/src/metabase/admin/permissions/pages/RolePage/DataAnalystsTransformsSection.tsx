import { useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { hasWritableConnectionDetails } from "metabase/common/utils/database";
import { SettingsSection } from "metabase/settings-components";
import { Button, Divider, Group, Icon, Stack, Switch, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DatabaseId } from "metabase-types/api";

export function DataAnalystsTransformsSection() {
  const { data, isLoading, error } = useListDatabasesQuery();
  const databases = (data?.data ?? []).filter(hasWritableConnectionDetails);

  // PROTOTYPE: mocked — toggles are local state, not the Data Analysts group's
  // transforms permission in the data permissions graph.
  const [enabledIds, setEnabledIds] = useState<Set<DatabaseId>>(new Set());

  const handleToggle = (databaseId: DatabaseId, isEnabled: boolean) =>
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (isEnabled) {
        next.add(databaseId);
      } else {
        next.delete(databaseId);
      }
      return next;
    });

  return (
    <SettingsSection
      title={t`Transforms`}
      titleProps={{ order: 2, size: "h4" }}
      description={t`Choose which databases Data Analysts can see, edit, and run transforms on.`}
    >
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
        {databases.length === 0 ? (
          <Stack gap="md" align="flex-start">
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <Icon
                name="info"
                c="text-secondary"
                mt="2px"
                style={{ flexShrink: 0 }}
              />
              <Text c="text-secondary" lh={1.4}>
                {t`Transforms write their results back to your database, so they need a database with a writable connection. None of your databases have one yet.`}
              </Text>
            </Group>
            <Button component={Link} to={Urls.viewDatabases()}>
              {t`Set up a writable connection`}
            </Button>
          </Stack>
        ) : (
          <Stack gap={0}>
            {databases.map((database, index) => (
              <Stack key={database.id} gap={0}>
                {index > 0 && <Divider />}
                <Group justify="space-between" wrap="nowrap" py="md">
                  <Group gap="sm" wrap="nowrap">
                    <Icon name="database" c="text-secondary" />
                    <Text fw="bold">{database.name}</Text>
                  </Group>
                  <Switch
                    aria-label={t`Allow transforms on ${database.name}`}
                    checked={enabledIds.has(database.id)}
                    onChange={(event) =>
                      handleToggle(database.id, event.currentTarget.checked)
                    }
                  />
                </Group>
              </Stack>
            ))}
          </Stack>
        )}
      </LoadingAndErrorWrapper>
    </SettingsSection>
  );
}
