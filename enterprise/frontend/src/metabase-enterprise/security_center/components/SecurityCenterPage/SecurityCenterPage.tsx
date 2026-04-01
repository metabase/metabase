import { useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { useSetting } from "metabase/common/hooks";
import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";

import { useNotificationConfig } from "../../hooks/use-notification-config";
import { useSecurityAdvisories } from "../../hooks/use-security-advisories";
import type { AdvisoryFilter } from "../../types";
import { filterAdvisories, getTargetUpgradeVersion } from "../../utils";
import { AdvisoryFilterBar } from "../AdvisoryFilterBar/AdvisoryFilterBar";
import { AdvisoryList } from "../AdvisoryList/AdvisoryList";
import { NotificationChannelConfigModal } from "../NotificationChannelConfig/NotificationChannelConfig";
import { UpgradeBanner } from "../UpgradeBanner/UpgradeBanner";

import S from "./SecurityCenterPage.module.css";

const DEFAULT_FILTER: AdvisoryFilter = {
  severity: "all",
  status: "all",
  showAcknowledged: false,
};

export function SecurityCenterPage() {
  const { data: advisories, acknowledgeAdvisory } = useSecurityAdvisories();
  const [filter, setFilter] = useState<AdvisoryFilter>(DEFAULT_FILTER);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const notificationConfig = useNotificationConfig();
  const version = useSetting("version");

  const currentVersion = version?.tag ?? "";
  const targetVersion = getTargetUpgradeVersion(advisories);
  const filtered = filterAdvisories(advisories, filter);

  return (
    <Box className={S.root}>
      <Stack gap="lg" className={S.header}>
        <Group gap="sm" align="center">
          <Title order={1}>{t`Security Center`}</Title>
          <Tooltip label={t`Notification settings`}>
            <ActionIcon
              mt={5}
              variant="subtle"
              onClick={() => setSettingsOpen(true)}
              data-testid="notification-config-toggle"
            >
              <Icon name="gear" />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Text c="text-secondary" data-testid="current-version">
          {t`Current version`}: {currentVersion}
        </Text>
        {targetVersion && <UpgradeBanner targetVersion={targetVersion} />}
      </Stack>
      <Stack gap="xl" className={S.content}>
        <AdvisoryFilterBar
          className={S["filter-bar"]}
          filter={filter}
          onChange={setFilter}
        />
        {filtered.length === 0 ? (
          <EmptyState
            className={S["empty-state"]}
            icon="shield_outline"
            message={t`Your instance is up to date — no known security issues affect your configuration.`}
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
