import { useEffect } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useGetSettingsQuery } from "metabase/api";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { Stack, Title } from "metabase/ui";

import { SMTPConnectionCard } from "../Email/SMTPConnectionCard";
import { SettingsSection } from "../SettingsSection";
import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { EmailReplyToWidget } from "../widgets/EmailReplyToWidget";

export function EmailSettingsPage() {
  const { data: settingValues, isFetching: settingsLoading } =
    useGetSettingsQuery();
  const isHosted = settingValues?.["is-hosted?"];
  const isEmailConfigured = settingValues?.["email-configured?"];
  const hasEmailAllowListFeature = useHasTokenFeature("email_allow_list");
  const hasEmailRestrictRecipientsFeature = useHasTokenFeature(
    "email_restrict_recipients",
  );

  const dispatch = useDispatch();
  useEffect(() => {
    // it's important to check for settingsLoading to ensure isEmailConfigured is fresh.
    // Otherwise, /email/smtp form will navigate to /email but isEmailConfigured will still be false
    // and it'll redirect straight back to /email/smtp
    if (!isHosted && !isEmailConfigured && !settingsLoading) {
      dispatch(push("/admin/settings/email/smtp"));
    }
  }, [dispatch, isHosted, isEmailConfigured, settingsLoading]);
  return (
    <Stack gap="xl" maw="42rem" px="lg" py="sm">
      <Title order={1}>{t`Email`}</Title>
      {!isHosted && <SMTPConnectionCard />}
      <SettingsSection>
        <AdminSettingInput
          name="email-from-name"
          title={t`From Name`}
          placeholder="Metabase"
          inputType="text"
        />
        <AdminSettingInput
          name="email-from-address"
          title={t`From Address`}
          placeholder="metabase@yourcompany.com"
          inputType="text"
        />
        <EmailReplyToWidget />
        <AdminSettingInput
          name="bcc-enabled?"
          title={t`Add Recipients as CC or BCC`}
          inputType="radio"
          options={[
            { value: "true", label: t`BCC - Hide recipients` },
            {
              value: "false",
              label: t`CC - Disclose recipients`,
            },
          ]}
        />
        <AdminSettingInput
          hidden={!hasEmailAllowListFeature}
          name="subscription-allowed-domains"
          title={t`Approved domains for notifications`}
          inputType="text"
        />
        <AdminSettingInput
          hidden={!hasEmailRestrictRecipientsFeature}
          name="user-visibility"
          title={t`Suggest recipients on dashboard subscriptions and alerts`}
          inputType="select"
          options={[
            { value: "all", label: t`Suggest all users` },
            {
              value: "group",
              label: t`Only suggest users in the same groups`,
            },
            { value: "none", label: t`Don't show suggestions` },
          ]}
        />
      </SettingsSection>
    </Stack>
  );
}
