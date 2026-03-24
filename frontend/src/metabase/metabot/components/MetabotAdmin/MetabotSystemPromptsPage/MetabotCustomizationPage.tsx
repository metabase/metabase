import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Text } from "metabase/ui";

import { MetabotNavPane } from "../MetabotNavPane";

export function MetabotCustomizationPage() {
  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <SettingsPageWrapper title={t`Customize`}>
        <SettingsSection>
          <LoadingAndErrorWrapper loading={false}>
            <Text c="text-secondary" size="sm">
              {t`Yet to be implemented.`}
            </Text>
          </LoadingAndErrorWrapper>
        </SettingsSection>
      </SettingsPageWrapper>
    </AdminSettingsLayout>
  );
}
