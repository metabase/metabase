import { t } from "ttag";

import { UpsellPerformanceTools } from "metabase/admin/upsells";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { Stack } from "metabase/ui";

export const ToolsUpsell = () => {
  return (
    <Stack gap="lg">
      <MonitorHeaderTitle>{t`Erroring questions`}</MonitorHeaderTitle>
      <UpsellPerformanceTools source="settings-tools" />
    </Stack>
  );
};
