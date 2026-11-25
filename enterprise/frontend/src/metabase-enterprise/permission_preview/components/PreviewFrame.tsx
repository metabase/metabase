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
  onContentShown: () => void;
  onLocationChange: (item: string) => void;
}

export function PreviewFrame({
  token,
  name,
  initialItem,
  onContentShown,
  onLocationChange,
}: PreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const contentObserverRef = useRef<MutationObserver | null>(null);
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

  useEffect(() => () => contentObserverRef.current?.disconnect(), []);

  // The frame loads before it has the token, and paints its own loader until its
  // item has text. The caller keeps its loading state up until then. The frame's
  // own "Back" header paints first, so it does not count.
  function handleLoad() {
    const frameBody = frameRef.current?.contentDocument?.body;
    if (!frameBody) {
      return;
    }
    contentObserverRef.current?.disconnect();
    if (hasItemContent(frameBody)) {
      onContentShown();
      return;
    }
    const observer = new MutationObserver(() => {
      if (hasItemContent(frameBody)) {
        observer.disconnect();
        onContentShown();
      }
    });
    observer.observe(frameBody, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    contentObserverRef.current = observer;
  }

  return (
    <Box
      component="iframe"
      ref={frameRef}
      title={t`What ${name} sees`}
      src={source}
      display="block"
      w="100%"
      h="100%"
      bd={0}
      onLoad={handleLoad}
    />
  );
}

function hasItemContent(body: HTMLElement) {
  return body.innerText.replace(t`Back`, "").trim() !== "";
}
