import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { MetabotNavPane } from "metabase/metabot/components/MetabotAdmin/MetabotNavPane";
import { Group, Icon, Text } from "metabase/ui";

export function MetabotUsageLimitsPage() {
  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <SettingsPageWrapper title={t`AI usage limits`} mt="sm">
        <SettingsSection>
          <Group>
            <Icon name="ai" />
            <Text fz="md" c="text-secondary">
              {t`Not implemented yet. Come back later.`}
            </Text>
          </Group>
        </SettingsSection>
      </SettingsPageWrapper>
    </AdminSettingsLayout>
  );
}
