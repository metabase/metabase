import { useCallback, useMemo } from "react";

import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/api";
import {
  useDeleteEmailSMTPSettingsMutation,
  useUpdateEmailSMTPSettingsMutation,
} from "metabase/api/email";
import type { EmailSMTPSettings } from "metabase-types/api";

import { BaseSMTPConnectionForm } from "./BaseSMTPConnectionForm";
import { trackSMTPSetupSuccess } from "./analytics";

export const SelfHostedSMTPConnectionForm = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const [updateEmailSMTPSettings] = useUpdateEmailSMTPSettingsMutation();
  const [deleteEmailSMTPSettings] = useDeleteEmailSMTPSettingsMutation();
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingsDetails } = useGetAdminSettingsDetailsQuery();

  const mappedSettingValues = useMemo(
    () => ({
      host: settingValues?.["email-smtp-host"] ?? "",
      port: settingValues?.["email-smtp-port"] ?? null,
      security: settingValues?.["email-smtp-security"] ?? "none",
      username: settingValues?.["email-smtp-username"] ?? "",
      password: settingValues?.["email-smtp-password"] ?? "",
    }),
    [settingValues],
  );

  const mappedSettingsDetails = useMemo(
    () => ({
      host: settingsDetails?.["email-smtp-host"],
      port: settingsDetails?.["email-smtp-port"],
      security: settingsDetails?.["email-smtp-security"],
      username: settingsDetails?.["email-smtp-username"],
      password: settingsDetails?.["email-smtp-password"],
    }),
    [settingsDetails],
  );

  const handleUpdateMutation = useCallback(
    (formData: any) => {
      const emailSMTPData: EmailSMTPSettings = {
        "email-smtp-host": formData.host,
        "email-smtp-port": parseInt(formData.port),
        "email-smtp-security": formData.security,
        "email-smtp-username": formData.username,
        "email-smtp-password": formData.password,
      };
      return updateEmailSMTPSettings(emailSMTPData);
    },
    [updateEmailSMTPSettings],
  );

  const handleTrackSuccess = useCallback(() => {
    trackSMTPSetupSuccess({ eventDetail: "self-hosted" });
  }, []);

  return (
    <BaseSMTPConnectionForm
      onClose={onClose}
      settingValues={mappedSettingValues}
      settingsDetails={mappedSettingsDetails}
      secureMode={false}
      updateMutation={handleUpdateMutation}
      deleteMutation={deleteEmailSMTPSettings}
      dataTestId="self-hosted-smtp-connection-form"
      onTrackSuccess={handleTrackSuccess}
    />
  );
};
