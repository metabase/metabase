import type { Location } from "history";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";
import { useSyncSecurityAdvisoriesMutation } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { useSetting, useToast } from "metabase/common/hooks";
import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import {
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { trackSecurityCenterPageViewed } from "../../analytics";
import {
  NotificationConfigProvider,
  useNotificationConfigState,
} from "../../hooks/use-notification-config";
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
  showAcknowledged: false,
};

const MAX_POLL_COUNT = 30;

type SecurityCenterPageProps = {
  location?: Location<{ open?: string }>;
};

export function SecurityCenterPage({ location }: SecurityCenterPageProps = {}) {
  const [isPolling, setIsPolling] = useState(false);
  const {
    data: advisories,
    lastCheckedAt,
    isError,
    acknowledgeAdvisory,
    acknowledgeAdvisories,
  } = useSecurityAdvisories(isPolling);
  const [syncAdvisories, { isLoading: isSyncing }] =
    useSyncSecurityAdvisoriesMutation();
  const [filter, setFilter] = useState<AdvisoryFilter>(DEFAULT_FILTER);
  const [settingsOpen, setSettingsOpen] = useState(
    () => location?.query?.open === "notifications",
  );
  const notificationConfig = useNotificationConfigState();
  const version = useSetting("version");
  const [sendToast] = useToast();
  const isSmallScreen = useIsSmallScreen();

  const lastCheckedAtBeforeSync = useRef<string | null>(null);
  const pollCountRef = useRef(0);

  const handleSync = useCallback(async () => {
    lastCheckedAtBeforeSync.current = lastCheckedAt;
    pollCountRef.current = 0;

    try {
      await syncAdvisories().unwrap();
      sendToast({
        icon: "sync",
        message: t`Checking for security advisories…`,
      });
      setIsPolling(true);
    } catch {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to check for security advisories`,
      });
    }
  }, [lastCheckedAt, syncAdvisories, sendToast]);

  useEffect(() => {
    if (!isPolling) {
      return;
    }

    pollCountRef.current += 1;

    const syncCompleted =
      lastCheckedAt !== null &&
      lastCheckedAt !== lastCheckedAtBeforeSync.current;

    if (syncCompleted) {
      setIsPolling(false);
      sendToast({
        icon: "check_filled",
        message: t`Security advisories are up to date`,
      });
    } else if (pollCountRef.current >= MAX_POLL_COUNT) {
      setIsPolling(false);
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Security advisory check is taking longer than expected. Results will appear when ready.`,
      });
    }
  }, [isPolling, lastCheckedAt, sendToast]);

  const isSyncInProgress = isSyncing || isPolling;

  useEffect(() => {
    trackSecurityCenterPageViewed();
  }, []);

  const currentVersion = version?.tag ?? "";
  const targetVersion = getTargetUpgradeVersion(advisories);
  const filtered = filterAdvisories(advisories, filter);

  if (isError) {
    return (
      <Box className={S.root}>
        <Stack gap="lg" className={S.header}>
          <Title order={1}>{t`Security Center`}</Title>
        </Stack>
        <Stack gap="xl" className={S.content}>
          <EmptyState
            className={S.emptyState}
            icon="warning_triangle_filled"
            message={t`Something went wrong loading security advisories.`}
          />
        </Stack>
      </Box>
    );
  }

  return (
    <NotificationConfigProvider value={notificationConfig}>
      <AdminSettingsLayout>
        <Box className={S.root} data-testid="security-center-page">
          <Stack gap="md" className={S.header}>
            <Group gap="sm" align="center">
              <Title order={1}>{t`Security Center`}</Title>
              <Box style={{ flex: 1 }} />
              <Button
                variant="subtle"
                leftSection={
                  isSyncInProgress ? (
                    <Loader size="1rem" />
                  ) : (
                    <Icon name="sync" />
                  )
                }
                onClick={handleSync}
                disabled={isSyncInProgress}
                data-testid="sync-advisories"
              >
                {isSmallScreen ? null : t`Check now`}
              </Button>
              <Button
                variant="subtle"
                leftSection={isSmallScreen ? undefined : <Icon name="gear" />}
                onClick={() => setSettingsOpen(true)}
                data-testid="notification-config-toggle"
              >
                {isSmallScreen ? (
                  <Icon name="gear" />
                ) : (
                  t`Notification settings`
                )}
              </Button>
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
            <AdvisoryList
              className={S.list}
              advisories={filtered}
              onAcknowledge={acknowledgeAdvisory}
              onAcknowledgeAll={acknowledgeAdvisories}
            />
          </Stack>
          <NotificationChannelConfigModal
            opened={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
        </Box>
      </AdminSettingsLayout>
    </NotificationConfigProvider>
  );
}
