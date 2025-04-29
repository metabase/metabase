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

import { useSdkIframeEmbedEventBus } from "../../hooks/use-sdk-interactive-embed-event";
import type {
  SdkIframeEmbedSettings,
  StoreWithSdkState,
} from "../../types/iframe";

import S from "./SdkIframeEmbedRoute.module.css";

export const SdkIframeEmbedRoute = () => {
  const store = useStore();
  const { iframeAuthConfig, iframeSettings } = useSdkIframeEmbedEventBus();

  useEffect(() => {
    // tell the redux store we're embedding the SDK components in an iframe
    store.dispatch(setIsEmbeddingSdk(true));
  }, [store]);

  const authConfig = useMemo(() => {
    if (!iframeAuthConfig) {
      return;
    }

    // TODO: to be implemented once the new SSO implementation on the SDK is ready
    if (iframeAuthConfig.type === "sso") {
      return;
    }

    return defineMetabaseAuthConfig({
      metabaseInstanceUrl: iframeAuthConfig.metabaseInstanceUrl,
      apiKey: iframeAuthConfig.apiKey,
    });
  }, [iframeAuthConfig]);

  const { theme } = iframeSettings ?? {};

  // TODO: add support for SSO auth once the new SSO implementation on the SDK is ready
  const isAuthReady = !!authConfig?.apiKey;

  if (!isAuthReady || !authConfig || iframeSettings === null) {
    return (
      <Center h="100%" mih="100vh">
        <Loader />
      </Center>
    );
  }

  return (
    <MetabaseProviderInternal
      authConfig={authConfig}
      theme={theme}
      store={store as StoreWithSdkState}
      classNames={{ portalContainer: S.SdkIframeEmbedPortalContainer }}
    >
      <Box h="100vh" bg={theme?.colors?.background}>
        <SdkIframeEmbedView settings={iframeSettings} />
      </Box>
    </MetabaseProviderInternal>
  );
};

export const SdkIframeEmbedView = ({
  settings,
}: {
  settings: SdkIframeEmbedSettings;
}) => {
  const { embedResourceType, embedResourceId } = settings;

  return match([embedResourceType, embedResourceId])
    .with(["dashboard", P.nonNullable], ([, id]) => (
      <InteractiveDashboard
        dashboardId={id}
        drillThroughQuestionHeight="100%"
      />
    ))
    .with(["question", P.nonNullable], ([, id]) => (
      <InteractiveQuestion questionId={id} height="100%" />
    ))
    .otherwise(() => null);
};
