import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { getContentUrl } from "metabase/embedding/permission-preview/item";
import {
  createTokenMessage,
  isLocationMessage,
  isReadyMessage,
} from "metabase/embedding/permission-preview/messages";
import { Box } from "metabase/ui";

interface PreviewFrameProps {
  token: string;
  name: string;
  initialItem: string;
  onLocationChange: (item: string) => void;
}

export function PreviewFrame({
  token,
  name,
  initialItem,
  onLocationChange,
}: PreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [source] = useState(() => getContentUrl(initialItem));

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const frameWindow = frameRef.current?.contentWindow;
      const isFromFrame =
        event.origin === window.location.origin &&
        frameWindow != null &&
        event.source === frameWindow;

      if (!isFromFrame) {
        return;
      }
      if (isReadyMessage(event.data)) {
        frameWindow.postMessage(
          createTokenMessage(token),
          window.location.origin,
        );
      }
      if (isLocationMessage(event.data)) {
        onLocationChange(event.data.item);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [token, onLocationChange]);

  return (
    <Box
      component="iframe"
      ref={frameRef}
      title={t`Preview of ${name}`}
      src={source}
      flex={1}
      w="100%"
      style={{ border: "1px solid var(--mb-color-border-neutral)" }}
    />
  );
}
