import { useEffect, useRef } from "react";

import { Box } from "metabase/ui";

import {
  CONTENT_PREVIEW_SESSION_MESSAGE_TYPE,
  getContentPreviewUrl,
  isContentPreviewLocationMessage,
  isContentPreviewPath,
  isContentPreviewReadyMessage,
} from "../content-preview";

import type { GetFrameSource } from "./TroubleshootPage";

/** Only the item, rendered with the SDK on this origin, signed in by the preview session's token. */
export const getContentFrameSource: GetFrameSource = ({ path, preview }) => ({
  key: preview.preview_id,
  src: getContentPreviewUrl(path),
});

type ContentPreviewFrameProps = {
  title: string;
  src: string;
  sessionToken: string;
  onPathChange: (path: string) => void;
  /** The frame lost its token (it reloaded): start a new preview session for a new frame. */
  onRestart: () => void;
};

/**
 * The "Content only" frame: hands the person's session token to the frame when it asks, once, by `postMessage`
 * to this origin only, and follows the item it reports.
 */
export function ContentPreviewFrame({
  title,
  src,
  sessionToken,
  onPathChange,
  onRestart,
}: ContentPreviewFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const hasSentTokenRef = useRef(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      const frameWindow = ref.current?.contentWindow;
      const isFromFrame =
        frameWindow != null &&
        event.source === frameWindow &&
        event.origin === window.location.origin;
      if (!isFromFrame) {
        return;
      }
      if (isContentPreviewReadyMessage(event.data)) {
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
  }, [sessionToken, onPathChange, onRestart]);

  // A link that navigates the frame itself (a link card, a click behavior) would load the full app with the
  // admin's cookie: stop it there and start the content frame again.
  const handleLoad = () => {
    const frameWindow = ref.current?.contentWindow;
    if (frameWindow != null && hasLeftContentPreview(frameWindow)) {
      frameWindow.location.replace("about:blank");
      onRestart();
    }
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
