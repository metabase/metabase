import { useClipboard } from "@mantine/hooks";
import { useEffect } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";

export function useCopyLink() {
  const [sendToast] = useToast();
  const clipboard = useClipboard();

  useEffect(() => {
    if (clipboard.copied) {
      sendToast({ icon: "check", message: t`Copied link` });
    }
  }, [clipboard.copied, sendToast]);

  useEffect(() => {
    if (clipboard.error) {
      sendToast({
        icon: "warning_triangle_filled",
        message: t`Couldn't copy link`,
      });
    }
  }, [clipboard.error, sendToast]);

  return clipboard.copy;
}
