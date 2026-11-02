import { t } from "ttag";

import { useToast } from "metabase/common/hooks";

export const useRecheckErrorToast = () => {
  const [sendToast] = useToast();

  return () =>
    sendToast({
      variant: "negative",
      message: t`Failed to re-check. Please try again.`,
    });
};
