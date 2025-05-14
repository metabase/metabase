import { useEffect } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { Stack } from "metabase/ui";

import { SMTPConnectionCard } from "../Email/SMTPConnectionCard";
import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { EmailReplyToWidget } from "../widgets/EmailReplyToWidget";

export function EmailSettingsPage() {
  const isHosted = useSetting("is-hosted?");
  const isEmailConfigured = useSetting("email-configured?");
  const hasEmailAllowListFeature = useHasTokenFeature("email_allow_list");
  const hasEmailRestrictRecipientsFeature = useHasTokenFeature(
    "email_restrict_recipients",
  );

  const dispatch = useDispatch();
  useEffect(() => {
    if (!isHosted && !isEmailConfigured) {
      dispatch(push("/admin/settings/email/smtp"));
    }
  }, [dispatch, isHosted, isEmailConfigured]);
  return (
    <Stack gap="xl" maw="42rem" px="lg" py="sm">
      {!isHosted && <SMTPConnectionCard />}
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
    </Stack>
  );
}
