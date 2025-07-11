import { useCallback } from "react";

import {
  useDeleteEmailSMTPSettingsMutation,
  useUpdateEmailSMTPSettingsMutation,
} from "metabase/api/email";

import { BaseSMTPConnectionForm } from "./BaseSMTPConnectionForm";
import { trackSMTPSetupSuccess } from "./analytics";

export const SelfHostedSMTPConnectionForm = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const [updateEmailSMTPSettings] = useUpdateEmailSMTPSettingsMutation();
  const [deleteEmailSMTPSettings] = useDeleteEmailSMTPSettingsMutation();
  const handleTrackSuccess = useCallback(() => {
    trackSMTPSetupSuccess({ eventDetail: "self-hosted" });
  }, []);

  return (
    <BaseSMTPConnectionForm
      onClose={onClose}
      secureMode={false}
      updateMutation={updateEmailSMTPSettings}
      deleteMutation={deleteEmailSMTPSettings}
      dataTestId="self-hosted-smtp-connection-form"
      onTrackSuccess={handleTrackSuccess}
      getFullFormKey={(shortFormKey) => {
        const mapFormKeyToSettingKey = {
          host: "email-smtp-host",
          port: "email-smtp-port",
          security: "email-smtp-security",
          username: "email-smtp-username",
          password: "email-smtp-password",
        } as const;
        return mapFormKeyToSettingKey[shortFormKey];
      }}
    />
  );
};
