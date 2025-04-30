import { useEffect, useMemo } from "react";
import { P, match } from "ts-pattern";

import {
  InteractiveDashboard,
  InteractiveQuestion,
  defineMetabaseAuthConfig,
} from "embedding-sdk";
import { MetabaseProviderInternal } from "embedding-sdk/components/public/MetabaseProvider";
import { useStore } from "metabase/lib/redux";
import { setIsEmbeddingSdk } from "metabase/redux/embed";
import { Box, Center, Loader } from "metabase/ui";

import { useSdkIframeEmbedEventBus } from "../../hooks/use-sdk-iframe-embed-event-bus";
import type { SdkIframeEmbedSettings } from "../../types/embed";
import type { StoreWithSdkState } from "../../types/store";

import S from "./SdkIframeEmbedRoute.module.css";

export const SdkIframeEmbedRoute = () => {
  const store = useStore();
  const { embedSettings } = useSdkIframeEmbedEventBus();

  useEffect(() => {
    // we are not using getSdkStore so `isEmbeddingSdk: true` isn't set automatically
    store.dispatch(setIsEmbeddingSdk(true));
  }, [store]);

  const authConfig = useMemo(() => {
    if (!embedSettings) {
      return;
    }

    // TODO: add support for SSO auth once the new SSO implementation on the SDK is ready
    if (!embedSettings.instanceUrl || !embedSettings.apiKey) {
      return;
    }

    return defineMetabaseAuthConfig({
      metabaseInstanceUrl: embedSettings.instanceUrl,
      apiKey: embedSettings.apiKey,
    });
  }, [embedSettings]);

  if (embedSettings === null || !authConfig) {
    return (
      <Center h="100%" mih="100vh">
        <Loader />
      </Center>
    );
  }

  const { theme, locale } = embedSettings;

  return (
    <MetabaseProviderInternal
      authConfig={authConfig}
      theme={theme}
      locale={locale}
      store={store as StoreWithSdkState}
      classNames={{ portalContainer: S.SdkIframeEmbedPortalContainer }}
    >
      <Box h="100vh" bg={theme?.colors?.background}>
        <SdkIframeEmbedView settings={embedSettings} />
      </Box>
    </MetabaseProviderInternal>
  );
};

export const SdkIframeEmbedView = ({
  settings,
}: {
  settings: SdkIframeEmbedSettings;
}) => {
  const { dashboardId, questionId, template } = settings;

  return match({ dashboardId, questionId, template })
    .with({ template: "exploration" }, () => (
      <InteractiveQuestion
        questionId="new"
        height="100%"
        isSaveEnabled={false}
      />
    ))
    .with({ dashboardId: P.nonNullable }, ({ dashboardId }) => (
      <InteractiveDashboard
        dashboardId={dashboardId}
        drillThroughQuestionHeight="100%"
      />
    ))
    .with({ questionId: P.nonNullable }, ({ questionId }) => (
      <InteractiveQuestion questionId={questionId} height="100%" />
    ))
    .otherwise(() => null);
};
