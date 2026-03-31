import { useState } from "react";
import { t } from "ttag";

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
import { filterAdvisories } from "../../utils";
import { AdvisoryFilterBar } from "../AdvisoryFilterBar/AdvisoryFilterBar";
import { AdvisoryList } from "../AdvisoryList/AdvisoryList";
import { NotificationChannelConfigModal } from "../NotificationChannelConfig/NotificationChannelConfig";

import S from "./SecurityCenterPage.module.css";

// TODO: replace with actual version from settings once available
const CURRENT_VERSION = "v0.59.3";

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
          {t`Current version`}: {CURRENT_VERSION}
        </Text>
      </Stack>
      <Stack gap="xl" className={S.content}>
        <AdvisoryFilterBar
          className={S["filter-bar"]}
          filter={filter}
          onChange={setFilter}
        />
        <AdvisoryList
          className={S.list}
          advisories={filtered}
          onAcknowledge={acknowledgeAdvisory}
        />
      </Stack>
      <NotificationChannelConfigModal
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        {...notificationConfig}
      />
    </Box>
  );
}
