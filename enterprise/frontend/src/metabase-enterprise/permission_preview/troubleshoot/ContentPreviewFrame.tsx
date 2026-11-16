import { useEffect, useRef } from "react";

import { Box } from "metabase/ui";

import {
  CONTENT_PREVIEW_SESSION_MESSAGE_TYPE,
  isContentPreviewLocationMessage,
  isContentPreviewPath,
  isContentPreviewReadyMessage,
} from "../content-preview";

type ContentPreviewFrameProps = {
  title: string;
  src: string;
  /** Where the frame's document is: this origin, or the preview host's. */
  frameOrigin: string;
  /** On this origin, the token the frame asks for; on the preview host its cookie signs it in. */
  sessionToken?: string;
  onPathChange: (path: string) => void;
  /** The frame lost its token (it reloaded): start a new preview session for a new frame. */
  onRestart: () => void;
  onLoad?: () => void;
};

/**
 * The troubleshooting page's frame: on this origin, hands the person's session token to the frame when it asks,
 * once, by `postMessage` to this origin only; on either origin, follows the item the frame reports.
 */
export function ContentPreviewFrame({
  title,
  src,
  frameOrigin,
  sessionToken,
  onPathChange,
  onRestart,
  onLoad,
}: ContentPreviewFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const hasSentTokenRef = useRef(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      const frameWindow = ref.current?.contentWindow;
      const isFromFrame =
        frameWindow != null &&
        event.source === frameWindow &&
        event.origin === frameOrigin;
      if (!isFromFrame) {
        return;
      }
      if (isContentPreviewReadyMessage(event.data) && sessionToken != null) {
        if (hasSentTokenRef.current) {
          onRestart();
          return;
        }
        hasSentTokenRef.current = true;
        frameWindow.postMessage(
          { type: CONTENT_PREVIEW_SESSION_MESSAGE_TYPE, sessionToken },
          window.location.origin,
        );
      } else if (isContentPreviewLocationMessage(event.data)) {
        onPathChange(event.data.path);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [frameOrigin, sessionToken, onPathChange, onRestart]);

  // A link that navigates the frame itself (a link card, a click behavior) would load the full app with the
  // admin's cookie: stop it there and start the content frame again.
  const handleLoad = () => {
    const frameWindow = ref.current?.contentWindow;
    if (frameWindow != null && hasLeftContentPreview(frameWindow)) {
      frameWindow.location.replace("about:blank");
      onRestart();
      return;
    }
    onLoad?.();
  };

  return (
    <Box
      component="iframe"
      ref={ref}
      title={title}
      src={src}
      onLoad={handleLoad}
      w="100%"
      h="100%"
      display="block"
      style={{ border: 0 }}
    />
  );
}

function hasLeftContentPreview(frameWindow: Window): boolean {
  try {
    const { href, pathname } = frameWindow.location;
    return href !== "about:blank" && !isContentPreviewPath(pathname);
  } catch {
    // another origin, where the admin's cookie can't sign the frame in
    return false;
  }
}
