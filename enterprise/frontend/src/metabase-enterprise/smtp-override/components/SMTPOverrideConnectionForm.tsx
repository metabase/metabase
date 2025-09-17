import { useCallback } from "react";

import { BaseSMTPConnectionForm } from "metabase/admin/settings/components/Email/BaseSMTPConnectionForm";
import { trackSMTPSetupSuccess } from "metabase/admin/settings/components/Email/analytics";
import {
  useDeleteEmailSMTPOverrideSettingsMutation,
  useUpdateEmailSMTPOverrideSettingsMutation,
} from "metabase-enterprise/api/smtp-override";

export const SMTPOverrideConnectionForm = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const [updateCloudEmailSMTPSettings] =
    useUpdateEmailSMTPOverrideSettingsMutation();
  const [deleteCloudEmailSMTPSettings] =
    useDeleteEmailSMTPOverrideSettingsMutation();
  const handleTrackSuccess = useCallback(() => {
    trackSMTPSetupSuccess({ eventDetail: "cloud" });
  }, []);

  return (
    <BaseSMTPConnectionForm
      onClose={onClose}
      secureMode={true}
      updateMutation={updateCloudEmailSMTPSettings}
      deleteMutation={deleteCloudEmailSMTPSettings}
      dataTestId="smtp-override-connection-form"
      onTrackSuccess={handleTrackSuccess}
      getFullFormKey={(shortFormKey) => {
        const mapFormKeyToSettingKey = {
          host: "email-smtp-host-override",
          port: "email-smtp-port-override",
          security: "email-smtp-security-override",
          username: "email-smtp-username-override",
          password: "email-smtp-password-override",
        } as const;
        return mapFormKeyToSettingKey[shortFormKey];
      }}
    />
  );
};
