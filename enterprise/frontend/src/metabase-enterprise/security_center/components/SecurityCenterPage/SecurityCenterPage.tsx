import { useState } from "react";
import { t } from "ttag";

import { Box, Divider, Stack, Text, Title } from "metabase/ui";

import { useNotificationConfig } from "../../hooks/use-notification-config";
import { useSecurityAdvisories } from "../../hooks/use-security-advisories";
import type { AdvisoryFilter } from "../../types";
import { filterAdvisories } from "../../utils";
import { AdvisoryFilterBar } from "../AdvisoryFilterBar/AdvisoryFilterBar";
import { AdvisoryList } from "../AdvisoryList/AdvisoryList";
import { NotificationChannelConfig } from "../NotificationChannelConfig/NotificationChannelConfig";

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
  const notificationConfig = useNotificationConfig();

  const filtered = filterAdvisories(advisories, filter);

  return (
    <Box>
      <Stack gap="lg" className={S.header}>
        <Title order={1}>{t`Security Center`}</Title>
        <Text c="text-secondary" data-testid="current-version">
          {t`Current version`}: {CURRENT_VERSION}
        </Text>
      </Stack>
      <Stack gap="xl">
        <NotificationChannelConfig {...notificationConfig} />
        <Divider />
        <Box>
          <AdvisoryFilterBar filter={filter} onChange={setFilter} />
        </Box>
        <AdvisoryList
          advisories={filtered}
          onAcknowledge={acknowledgeAdvisory}
        />
      </Stack>
    </Box>
  );
}
