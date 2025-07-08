import { useCallback, useMemo } from "react";

import { BaseSMTPConnectionForm } from "metabase/admin/settings/components/Email/BaseSMTPConnectionForm";
import { trackSMTPSetupSuccess } from "metabase/admin/settings/components/Email/analytics";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/api";
import {
  useDeleteEmailSMTPOverrideSettingsMutation,
  useUpdateEmailSMTPOverrideSettingsMutation,
} from "metabase-enterprise/api/smtp-override";
import type { EmailSMTPOverrideSettings } from "metabase-types/api";

export const SMTPOverrideConnectionForm = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const [updateCloudEmailSMTPSettings] =
    useUpdateEmailSMTPOverrideSettingsMutation();
  const [deleteCloudEmailSMTPSettings] =
    useDeleteEmailSMTPOverrideSettingsMutation();
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingsDetails } = useGetAdminSettingsDetailsQuery();

  const mappedSettingValues = useMemo(
    () => ({
      host: settingValues?.["email-smtp-host-override"] ?? "",
      port: settingValues?.["email-smtp-port-override"]
        ? settingValues?.["email-smtp-port-override"] + ""
        : "465",
      security: settingValues?.["email-smtp-security-override"] ?? "ssl",
      username: settingValues?.["email-smtp-username-override"] ?? "",
      password: settingValues?.["email-smtp-password-override"] ?? "",
    }),
    [settingValues],
  );

  const mappedSettingsDetails = useMemo(
    () => ({
      host: settingsDetails?.["email-smtp-host-override"],
      port: settingsDetails?.["email-smtp-port-override"],
      security: settingsDetails?.["email-smtp-security-override"],
      username: settingsDetails?.["email-smtp-username-override"],
      password: settingsDetails?.["email-smtp-password-override"],
    }),
    [settingsDetails],
  );

  const handleUpdateMutation = useCallback(
    (formData: any) => {
      const emailSMTPData: EmailSMTPOverrideSettings = {
        "email-smtp-host-override": formData.host,
        "email-smtp-port-override": parseInt(
          formData.port,
        ) as EmailSMTPOverrideSettings["email-smtp-port-override"],
        "email-smtp-security-override": formData.security,
        "email-smtp-username-override": formData.username,
        "email-smtp-password-override": formData.password,
      };
      return updateCloudEmailSMTPSettings(emailSMTPData);
    },
    [updateCloudEmailSMTPSettings],
  );

  const handleTrackSuccess = useCallback(() => {
    trackSMTPSetupSuccess({ eventDetail: "cloud" });
  }, []);

  return (
    <BaseSMTPConnectionForm
      onClose={onClose}
      settingValues={mappedSettingValues}
      settingsDetails={mappedSettingsDetails}
      secureMode={true}
      updateMutation={handleUpdateMutation}
      deleteMutation={deleteCloudEmailSMTPSettings}
      dataTestId="smtp-override-connection-form"
      onTrackSuccess={handleTrackSuccess}
    />
  );
};
