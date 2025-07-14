import { t } from "ttag";

import { useSendTestEmailMutation } from "metabase/api/email";
import { getErrorMessage } from "metabase/api/utils";
import { useSetting, useToast } from "metabase/common/hooks";
import { Button, Text } from "metabase/ui";

export function SendTestEmailWidget() {
  const [sendTestEmail, sendTestEmailResult] = useSendTestEmailMutation();
  const [sendToast] = useToast();
  const isHosted = useSetting("is-hosted?");
  const isEmailConfigured = useSetting("email-configured?");
  const isLoading = sendTestEmailResult.isLoading;
  if (!isHosted && !isEmailConfigured) {
    return null;
  }

  const handleSendTestEmail = async () => {
    try {
      await sendTestEmail().unwrap();
      sendToast({
        message: t`Email sent!`,
        toastColor: "success",
      });
    } catch (error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: getTestEmailErrorMessage(error),
      });
    }
  };

  return (
    <>
      {Boolean(sendTestEmailResult.error) && (
        <Text
          role="alert"
          aria-label={getTestEmailErrorMessage(sendTestEmailResult.error)}
          color="error"
          mb="1rem"
        >
          {getTestEmailErrorMessage(sendTestEmailResult.error)}
        </Text>
      )}
      <Button onClick={handleSendTestEmail} disabled={isLoading}>
        {isLoading ? t`Sending...` : t`Send test email`}
      </Button>
    </>
  );
}

function getTestEmailErrorMessage(error: any) {
  return getErrorMessage(error, t`Error sending test email`);
}
