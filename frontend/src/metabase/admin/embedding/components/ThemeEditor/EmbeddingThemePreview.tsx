import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { METABASE_CONFIG_IS_PROXY_FIELD_NAME } from "metabase-enterprise/embedding_iframe_sdk/constants";
import { setupConfigWatcher } from "metabase-enterprise/embedding_iframe_sdk/embed";
import type { SdkIframeEmbedBaseSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";
import { useListRecentsQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { Card } from "metabase/ui";

import { useEmbeddingThemeEditor } from "./context";
import S from "./EmbeddingThemeEditor.module.css";

declare global {
  interface Window {
    metabaseConfig?: Partial<SdkIframeEmbedBaseSettings> & {
      [METABASE_CONFIG_IS_PROXY_FIELD_NAME]?: boolean;
    };
  }
}

export const EmbeddingThemePreview = () => {
  const { theme } = useEmbeddingThemeEditor();
  const [isLoading, setIsLoading] = useState(true);

  const instanceUrl = useSetting("site-url");

  // Get the most recent dashboard
  const { data: recentItems } = useListRecentsQuery(
    { context: ["views", "selections"] },
    { refetchOnMountOrArgChange: true },
  );

  const recentDashboard = useMemo(() => {
    return recentItems?.find((item) => item.model === "dashboard");
  }, [recentItems]);

  const defineMetabaseConfig = useCallback(
    (metabaseConfig: SdkIframeEmbedBaseSettings) => {
      window.metabaseConfig = metabaseConfig;

      if (!window.metabaseConfig[METABASE_CONFIG_IS_PROXY_FIELD_NAME]) {
        setupConfigWatcher();
      }
    },
    [],
  );

  const cleanupMetabaseConfig = useCallback(() => {
    if (window.metabaseConfig) {
      delete window.metabaseConfig;
    }
  }, []);

  const metabaseConfig = useMemo(
    () => ({
      instanceUrl,
      theme,
      useExistingUserSession: true,
    }),
    [instanceUrl, theme],
  );

  // Initial configuration, needed so that the element finds the config on first render
  if (!window.metabaseConfig?.instanceUrl) {
    defineMetabaseConfig(metabaseConfig);
  }

  useEffect(() => {
    defineMetabaseConfig(metabaseConfig);
  }, [metabaseConfig, defineMetabaseConfig]);

  useEffect(
    () => () => {
      cleanupMetabaseConfig();
    },
    [cleanupMetabaseConfig],
  );

  // Handle ready event
  useEffect(() => {
    const handleReady = () => setIsLoading(false);
    const embed = document.querySelector("metabase-dashboard");

    if (embed) {
      setIsLoading(true);
      embed.addEventListener("ready", handleReady);

      return () => {
        embed.removeEventListener("ready", handleReady);
      };
    }
  }, [recentDashboard?.id]);

  if (!recentDashboard) {
    return (
      <Card h="100%" className={S.EmbedPreviewIframe}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
          }}
        >
          No recent dashboard found
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={S.EmbedPreviewIframe}
      bg={theme?.colors?.background}
      h="100%"
      mih="100vh"
      pos="relative"
    >
      {createElement("metabase-dashboard", {
        "dashboard-id": recentDashboard.id,
        drills: true,
        "with-title": true,
      })}

      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme?.colors?.background ?? "white",
          }}
        >
          Loading...
        </div>
      )}
    </Card>
  );
};
