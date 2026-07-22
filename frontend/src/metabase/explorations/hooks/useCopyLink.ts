import { useCallback } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";

export function useCopyLink() {
  const [sendToast] = useToast();

  return useCallback(
    (url: string) => {
      navigator.clipboard
        .writeText(url)
        .then(() => sendToast({ icon: "check", message: t`Copied link` }))
        // Clipboard access can be denied (permissions, insecure context) —
        // don't claim success, and don't leak an unhandled rejection.
        .catch(() =>
          sendToast({
            icon: "warning_triangle_filled",
            message: t`Couldn't copy link`,
          }),
        );
    },
    [sendToast],
  );
}
