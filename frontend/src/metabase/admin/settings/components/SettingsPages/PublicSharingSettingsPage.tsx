import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Stack, Text, Title } from "metabase/ui";

import { SettingsSection } from "../SettingsSection";
import { AdminSettingInput } from "../widgets/AdminSettingInput";
import {
  PublicLinksActionListing,
  PublicLinksDashboardListing,
  PublicLinksQuestionListing,
} from "../widgets/PublicLinksListing";

export function PublicSharingSettingsPage() {
  const publicSharingEnabled = useSetting("enable-public-sharing");
  return (
    <Stack gap="xl" p="0 2rem 2rem 1rem">
      <Title order={1}>{t`Public Sharing`}</Title>
      <SettingsSection>
        <AdminSettingInput
          name="enable-public-sharing"
          title={t`Enable Public Sharing`}
          inputType="boolean"
        />
        {publicSharingEnabled && (
          <Stack gap="xl">
            <Stack gap="sm">
              <Text c="text-medium" fw="bold" tt="uppercase" display="block">
                {t`Shared Dashboards`}
              </Text>

              <PublicLinksDashboardListing />
            </Stack>
            <Stack gap="sm">
              <Text c="text-medium" fw="bold" tt="uppercase" display="block">
                {t`Shared Questions`}
              </Text>

              <PublicLinksQuestionListing />
            </Stack>
            <Stack gap="sm">
              <Text c="text-medium" fw="bold" tt="uppercase" display="block">
                {t`Shared Action Forms`}
              </Text>
              <PublicLinksActionListing />
            </Stack>
          </Stack>
        )}
      </SettingsSection>
    </Stack>
  );
}
