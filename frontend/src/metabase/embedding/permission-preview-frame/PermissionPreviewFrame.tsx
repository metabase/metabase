import { useEffect, useState } from "react";
import { t } from "ttag";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { getItemFromContentPath } from "metabase/embedding/permission-preview/item";
import {
  createLocationMessage,
  createReadyMessage,
  isTokenMessage,
} from "metabase/embedding/permission-preview/messages";

import { PreviewContent } from "./PreviewContent";
import { ReadOnlyToast } from "./ReadOnlyToast";
import { installPreviewFetch, setPreviewToken } from "./preview-requests";

const TOAST_DURATION_MS = 4000;

export function PermissionPreviewFrame() {
  const [hasToken, setHasToken] = useState(false);
  const [isToastOpen, setIsToastOpen] = useState(false);
  const isOpenedDirectly = window.parent === window;

  useEffect(() => {
    if (isOpenedDirectly) {
      return;
    }

    function handleMessage(event: MessageEvent) {
      const isFromParent =
        event.origin === window.location.origin &&
        event.source === window.parent;

      if (isFromParent && isTokenMessage(event.data)) {
        setPreviewToken(event.data.token);
        setHasToken(true);
      }
    }

    window.addEventListener("message", handleMessage);
    window.parent.postMessage(createReadyMessage(), window.location.origin);

    return () => window.removeEventListener("message", handleMessage);
  }, [isOpenedDirectly]);

  useEffect(() => {
    installPreviewFetch(() => setIsToastOpen(true));
  }, []);

  useEffect(() => {
    if (!isToastOpen) {
      return;
    }
    const timeout = setTimeout(() => setIsToastOpen(false), TOAST_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [isToastOpen]);

  function handleNavigate(item: string) {
    window.parent.postMessage(
      createLocationMessage(item),
      window.location.origin,
    );
  }

  if (isOpenedDirectly) {
    return (
      <p>{t`Start a preview from Admin > Permissions > Preview access.`}</p>
    );
  }

  if (!hasToken) {
    return null;
  }

  return (
    <ComponentProvider
      authConfig={{ metabaseInstanceUrl: window.location.origin }}
      allowConsoleLog={false}
    >
      <PreviewContent
        initialItem={getItemFromContentPath(window.location.pathname)}
        onNavigate={handleNavigate}
      />
      {isToastOpen && <ReadOnlyToast />}
    </ComponentProvider>
  );
}
