import { useState } from "react";
import { t } from "ttag";

import { useSyncSecurityAdvisoriesMutation } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { useSetting } from "metabase/common/hooks";
import { Box, Button, Group, Icon, Stack, Text, Title } from "metabase/ui";

import { useNotificationConfig } from "../../hooks/use-notification-config";
import { useSecurityAdvisories } from "../../hooks/use-security-advisories";
import type { AdvisoryFilter } from "../../types";
import { filterAdvisories, getTargetUpgradeVersion } from "../../utils";
import { AdvisoryFilterBar } from "../AdvisoryFilterBar/AdvisoryFilterBar";
import { AdvisoryList } from "../AdvisoryList/AdvisoryList";
import { NotificationChannelConfigModal } from "../NotificationChannelConfigModal/NotificationChannelConfigModal";
import { UpgradeBanner } from "../UpgradeBanner/UpgradeBanner";

import S from "./SecurityCenterPage.module.css";

const DEFAULT_FILTER: AdvisoryFilter = {
  severity: "all",
  status: "all",
  showAcknowledged: false,
};

export function SecurityCenterPage() {
  const { data: advisories, acknowledgeAdvisory } = useSecurityAdvisories();
  const [syncAdvisories, { isLoading: isSyncing }] =
    useSyncSecurityAdvisoriesMutation();
  const [filter, setFilter] = useState<AdvisoryFilter>(DEFAULT_FILTER);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const notificationConfig = useNotificationConfig();
  const version = useSetting("version");

  const currentVersion = version?.tag ?? "";
  const targetVersion = getTargetUpgradeVersion(advisories);
  const filtered = filterAdvisories(advisories, filter);

  const nothingToShow = filtered.length === 0 || advisories.length === 0;

  return (
    <Box className={S.root}>
      <Stack gap="lg" className={S.header}>
        <Group gap="sm" align="center">
          <Title order={1}>{t`Security Center`}</Title>
          <Box style={{ flex: 1 }} />
          <Button
            variant="subtle"
            leftSection={
              <Icon name="sync" className={isSyncing ? S.syncing : undefined} />
            }
            onClick={() => syncAdvisories()}
            data-testid="sync-advisories"
          >{t`Check now`}</Button>
          <Button
            variant="subtle"
            leftSection={<Icon name="gear" />}
            onClick={() => setSettingsOpen(true)}
            data-testid="notification-config-toggle"
          >{t`Notification settings`}</Button>
        </Group>
        <Text c="text-secondary" data-testid="current-version">
          {t`Current version`}: {currentVersion}
        </Text>
        {targetVersion && <UpgradeBanner targetVersion={targetVersion} />}
      </Stack>
      <Stack gap="xl" className={S.content}>
        <AdvisoryFilterBar
          className={S.filterBar}
          filter={filter}
          onChange={setFilter}
        />
        {nothingToShow ? (
          <EmptyState
            className={S.emptyState}
            icon="shield_outline"
            message={
              advisories.length === 0
                ? t`Your instance is up to date — no known security issues affect your configuration.`
                : t`Nothing match your filters.`
            }
          />
        ) : (
          <AdvisoryList
            className={S.list}
            advisories={filtered}
            onAcknowledge={acknowledgeAdvisory}
          />
        )}
      </Stack>
      <NotificationChannelConfigModal
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        {...notificationConfig}
      />
    </Box>
  );
}
