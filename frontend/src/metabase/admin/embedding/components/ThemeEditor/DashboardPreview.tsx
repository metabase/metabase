import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useSearchQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { METABASE_CONFIG_IS_PROXY_FIELD_NAME } from "metabase/embedding/embedding-iframe-sdk/constants";
import { setupConfigWatcher } from "metabase/embedding/embedding-iframe-sdk/embed";
import type { SdkIframeEmbedBaseSettings } from "metabase/embedding/embedding-iframe-sdk/types/embed";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { Box, Center, Loader } from "metabase/ui";

import S from "./PreviewPanel.module.css";

declare global {
  interface Window {
    metabaseConfig?: Partial<SdkIframeEmbedBaseSettings> & {
      [METABASE_CONFIG_IS_PROXY_FIELD_NAME]?: boolean;
    };
  }
}

export function DashboardPreviewLoader({ theme }: { theme: MetabaseTheme }) {
  const { data: searchResults } = useSearchQuery({
    models: ["dashboard"],
    limit: 1,
  });

  const dashboardId = searchResults?.data?.[0]?.id as number | undefined;

  if (!dashboardId) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    );
  }

  return <DashboardPreview theme={theme} dashboardId={dashboardId} />;
}

function DashboardPreview({
  theme,
  dashboardId,
}: {
  theme: MetabaseTheme;
  dashboardId: number;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceUrl = useSetting("site-url");

  const defineMetabaseConfig = useCallback(
    (config: SdkIframeEmbedBaseSettings) => {
      window.metabaseConfig = config;

      if (!window.metabaseConfig[METABASE_CONFIG_IS_PROXY_FIELD_NAME]) {
        setupConfigWatcher();
      }
    },
    [],
  );

  const metabaseConfig = useMemo(
    () => ({
      instanceUrl,
      theme,
      useExistingUserSession: true,
    }),
    [instanceUrl, theme],
  );

  // Initial configuration before first render
  if (!window.metabaseConfig?.instanceUrl) {
    defineMetabaseConfig(metabaseConfig);
  }

  useEffect(() => {
    defineMetabaseConfig(metabaseConfig);
  }, [metabaseConfig, defineMetabaseConfig]);

  useEffect(
    () => () => {
      if (window.metabaseConfig) {
        delete window.metabaseConfig;
      }
    },
    [],
  );

  // Track loading state via the "ready" event on the web component
  useEffect(() => {
    if (containerRef.current) {
      const embed = containerRef.current.querySelector("metabase-dashboard");
      const handleReady = () => setIsLoading(false);

      if (embed) {
        setIsLoading(true);
        embed.addEventListener("ready", handleReady);
        return () => embed.removeEventListener("ready", handleReady);
      }
    }
  }, [dashboardId]);

  return (
    <Box
      className={S.PreviewContainer}
      ref={containerRef}
      h="100%"
      pos="relative"
      style={{ backgroundColor: theme?.colors?.background }}
    >
      {createElement("metabase-dashboard", {
        "dashboard-id": String(dashboardId),
      })}

      {isLoading && (
        <Box
          pos="absolute"
          inset={0}
          style={{
            backgroundColor:
              theme?.colors?.background ?? "var(--mb-color-background-primary)",
          }}
        >
          <Center h="100%" w="100%">
            <Loader />
          </Center>
        </Box>
      )}
    </Box>
  );
}
