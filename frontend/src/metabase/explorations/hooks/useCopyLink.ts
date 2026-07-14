import { useCallback } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";

export function useCopyLink() {
  const [sendToast] = useToast();

  return useCallback(
    (url: string) => {
      navigator.clipboard.writeText(url);
      sendToast({ icon: "check", message: t`Copied link` });
    },
    [sendToast],
  );
}
