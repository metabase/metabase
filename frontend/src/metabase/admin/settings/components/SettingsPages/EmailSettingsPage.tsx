import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { UpsellHostingBanner } from "metabase/admin/upsells";
import { useGetSettingsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Center } from "metabase/ui";

import { SMTPConnectionCard } from "../Email/SMTPConnectionCard";
import { SMTPConnectionForm } from "../Email/SMTPConnectionForm";
import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { EmailReplyToWidget } from "../widgets/EmailReplyToWidget";

export function EmailSettingsPage() {
  const [showModal, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  const { data: settingValues, isLoading } = useGetSettingsQuery();
  const isHosted = settingValues?.["is-hosted?"];
  const isEmailConfigured = settingValues?.["email-configured?"];
  const hasEmailAllowListFeature = useHasTokenFeature("email_allow_list");
  const hasEmailRestrictRecipientsFeature = useHasTokenFeature(
    "email_restrict_recipients",
  );

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <>
      <SettingsPageWrapper title={t`Email`}>
        {!isHosted && <SMTPConnectionCard onOpenSMTPModal={openModal} />}
        {isEmailConfigured && (
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
        )}
        <Center>
          <UpsellHostingBanner location="settings-email-migrate_to_cloud" />
        </Center>
      </SettingsPageWrapper>
      {showModal && <SMTPConnectionForm onClose={closeModal} />}
    </>
  );
}
