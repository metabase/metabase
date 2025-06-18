import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  UpsellEmailWhitelabelBanner,
  UpsellHostingBanner,
} from "metabase/admin/upsells";
import { useGetSettingsQuery } from "metabase/api";
import { useHasTokenFeature } from "metabase/common/hooks";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";

import { CloudSMTPConnectionCard } from "../Email/CloudSMTPConnectionCard";
import { CloudSMTPConnectionForm } from "../Email/CloudSMTPConnectionForm";
import { SMTPConnectionCard } from "../Email/SMTPConnectionCard";
import { SMTPConnectionForm } from "../Email/SMTPConnectionForm";
import { SettingsPageWrapper, SettingsSection } from "../SettingsSection";
import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { EmailFromAddressWidget } from "../widgets/EmailFromAddressWidget";
import { EmailReplyToWidget } from "../widgets/EmailReplyToWidget";

export function EmailSettingsPage() {
  const [showModal, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  const [showCloudModal, { open: openCloudModal, close: closeCloudModal }] =
    useDisclosure(false);

  const { data: settingValues, isLoading } = useGetSettingsQuery();
  // const isHosted = settingValues?.["is-hosted?"] || true;
  const hasCloudSMTPFeature = true;
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
        {<SMTPConnectionCard onOpenSMTPModal={openModal} />}
        {hasCloudSMTPFeature && (
          <CloudSMTPConnectionCard onOpenCloudSMTPModal={openCloudModal} />
        )}
        <Center>
          <UpsellEmailWhitelabelBanner source="settings-email-migrate_to_cloud" />
        </Center>
        {isEmailConfigured && (
          <SettingsSection>
            <AdminSettingInput
              name="email-from-name"
              title={t`From Name`}
              placeholder="Metabase"
              inputType="text"
            />
            <EmailFromAddressWidget />
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
          <UpsellHostingBanner source="settings-email-migrate_to_cloud" />
        </Center>
      </SettingsPageWrapper>
      {showModal && <SMTPConnectionForm onClose={closeModal} />}
      {showCloudModal && <CloudSMTPConnectionForm onClose={closeCloudModal} />}
    </>
  );
}
