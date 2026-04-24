import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { match } from "ts-pattern";

import { useSetting } from "metabase/common/hooks";
import { METABASE_CONFIG_IS_PROXY_FIELD_NAME } from "metabase/embedding/embedding-iframe-sdk/constants";
import { setupConfigWatcher } from "metabase/embedding/embedding-iframe-sdk/embed";
import type { SdkIframeEmbedBaseSettings } from "metabase/embedding/embedding-iframe-sdk/types/embed";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { Box, Center, Loader } from "metabase/ui";

import S from "./PreviewPanel.module.css";
import type { PreviewResource } from "./types";

declare global {
  interface Window {
    metabaseConfig?: Partial<SdkIframeEmbedBaseSettings> & {
      [METABASE_CONFIG_IS_PROXY_FIELD_NAME]?: boolean;
    };
  }
}

export function ResourcePreview({
  theme,
  resource,
}: {
  theme: MetabaseTheme;
  resource: PreviewResource;
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

  const { componentName, attributes } = getResourceElement(resource);

  // Track loading state via the "ready" event on the web component
  useEffect(() => {
    if (containerRef.current) {
      const embed = containerRef.current.querySelector(componentName);
      const handleReady = () => setIsLoading(false);

      if (embed) {
        setIsLoading(true);
        embed.addEventListener("ready", handleReady);
        return () => embed.removeEventListener("ready", handleReady);
      }
    }
  }, [componentName, resource.id]);

  return (
    <Box
      className={S.PreviewContainer}
      ref={containerRef}
      h="100%"
      pos="relative"
      style={{ backgroundColor: theme?.colors?.background }}
    >
      {createElement(componentName, attributes)}

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

const getResourceElement = (
  resource: PreviewResource,
): {
  componentName: "metabase-dashboard" | "metabase-question";
  attributes: Record<string, string>;
} =>
  match(resource)
    .with({ model: "dashboard" }, ({ id }) => ({
      componentName: "metabase-dashboard" as const,
      attributes: { "dashboard-id": String(id) },
    }))
    .with({ model: "card" }, ({ id }) => ({
      componentName: "metabase-question" as const,
      attributes: { "question-id": String(id) },
    }))
    .exhaustive();
