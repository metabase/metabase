import type { Location } from "history";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useSyncSecurityAdvisoriesMutation } from "metabase/api";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import DateTime from "metabase/common/components/DateTime";
import EmptyState from "metabase/common/components/EmptyState";
import type { ToastArgs } from "metabase/common/hooks";
import { useSetting } from "metabase/common/hooks";
import useIsSmallScreen from "metabase/common/hooks/use-is-small-screen";
import { useDispatch } from "metabase/lib/redux";
import { addUndo, dismissUndo } from "metabase/redux/undo";
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

const SYNC_TIMEOUT_MS = 60_000;
const SYNC_TOAST_ID = "security-center-sync";

type SecurityCenterPageProps = {
  location?: Location<{ open?: string }>;
};

export function SecurityCenterPage({ location }: SecurityCenterPageProps = {}) {
  const [isPolling, setIsPolling] = useState(false);
  const {
    data: advisories,
    lastCheckedAt,
    lastSyncAttemptedAt,
    lastSyncError,
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
  const dispatch = useDispatch();
  const sendSyncToast = useCallback(
    (toast: ToastArgs) => {
      dispatch(dismissUndo({ undoId: SYNC_TOAST_ID }));
      dispatch(addUndo({ ...toast, id: SYNC_TOAST_ID }));
    },
    [dispatch],
  );
  const isSmallScreen = useIsSmallScreen();

  const lastSyncAttemptedAtBeforeSync = useRef<string | null>(null);

  const handleSync = useCallback(async () => {
    lastSyncAttemptedAtBeforeSync.current = lastSyncAttemptedAt;
    sendSyncToast({
      icon: "sync",
      message: t`Checking for security advisories…`,
      timeout: 0,
    });

    try {
      await syncAdvisories().unwrap();
      setIsPolling(true);
    } catch {
      sendSyncToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to check for security advisories`,
      });
    }
  }, [lastSyncAttemptedAt, syncAdvisories, sendSyncToast]);

  useEffect(() => {
    if (!isPolling) {
      return;
    }

    const syncCompleted =
      lastSyncAttemptedAt !== null &&
      lastSyncAttemptedAt !== lastSyncAttemptedAtBeforeSync.current;

    if (syncCompleted && lastSyncError !== null) {
      setIsPolling(false);
      sendSyncToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Couldn't check for security advisories. Advisories may be out of date.`,
      });
    } else if (syncCompleted) {
      setIsPolling(false);
      sendSyncToast({
        icon: "check_filled",
        message: t`Security advisories are up to date`,
      });
    }
  }, [isPolling, lastSyncAttemptedAt, lastSyncError, sendSyncToast]);

  useEffect(() => {
    if (!isPolling) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setIsPolling(false);
      sendSyncToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Security advisory check is taking longer than expected. Results will appear when ready.`,
      });
    }, SYNC_TIMEOUT_MS);

    return () => clearTimeout(timeoutId);
  }, [isPolling, sendSyncToast]);

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
            <Stack gap="xs">
              <Text c="text-secondary" data-testid="last-checked-at">
                {t`Last successful check`}:{" "}
                {lastCheckedAt ? (
                  <DateTime value={lastCheckedAt} unit="minute" />
                ) : (
                  t`Never`
                )}
              </Text>
              {lastSyncError !== null && (
                <Text c="error" data-testid="last-sync-error">
                  {t`The last check for security advisories failed. Advisories may be out of date.`}
                </Text>
              )}
            </Stack>
            <UpgradeBanner targetVersion={targetVersion} />
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
