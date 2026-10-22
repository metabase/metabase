import { useEffect, useMemo, useState } from "react";
import useDeepCompareEffect from "react-use/lib/useDeepCompareEffect";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { getSdkStore, useSdkSelector } from "embedding-sdk-bundle/store";
import { getLoginStatus } from "embedding-sdk-bundle/store/selectors";
import { getDataAppNameFromPath } from "embedding-sdk-shared/lib/data-app-embed";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import type { MetabaseAuthConfig } from "embedding-sdk-shared/types/auth-config";
import { SdkLoadingState } from "embedding-sdk-shared/types/sdk-loading";
import { PLUGIN_API } from "metabase/api/client";
import { SdkIframeError } from "metabase/embedding/embedding-iframe-sdk/components/SdkIframeError";
import { useSdkIframeEmbedEventBus } from "metabase/embedding/embedding-iframe-sdk/hooks/use-sdk-iframe-embed-event-bus";
import type { SdkIframeEmbedSettings } from "metabase/embedding/embedding-iframe-sdk/types/embed";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import { Center, Loader } from "metabase/ui";
import type { DataAppMetabaseProviderProps } from "metabase-enterprise/data_apps/sandbox/types";

import { readNameFromUrl } from "../../lib/read-name-from-url";
import { useDataAppBundle } from "../../lib/use-data-app-bundle";
import { BundleErrorBoundary } from "../DataAppIframeApp/DataAppIframeApp";

const store = getSdkStore();

const onSettingsChanged = (settings: SdkIframeEmbedSettings) => {
  PLUGIN_API.onBeforeRequestHandlers.embedReferrer = async () => {
    if (settings._embedReferrer) {
      return {
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- HTTP header name
        headers: { "X-Metabase-Embed-Referrer": settings._embedReferrer },
      };
    }
  };
};

export function DataAppEmbed() {
  const name = useMemo(() => readNameFromUrl(), []);
  const { embedSettings } = useSdkIframeEmbedEventBus({
    store,
    onSettingsChanged,
  });
  const [providerProps, setProviderProps] =
    useState<DataAppMetabaseProviderProps>({});

  const authConfig = useMemo<MetabaseAuthConfig>(() => {
    const metabaseInstanceUrl = `${window.location.origin}${(window.MetabaseRoot ?? "/").replace(/\/+$/, "")}`;

    return { metabaseInstanceUrl, isGuest: false };
  }, []);

  useDeepCompareEffect(() => {
    ensureMetabaseProviderPropsStore().setProps({
      ...providerProps,
      authConfig,
    });
    ensureMetabaseProviderPropsStore().updateInternalProps({
      reduxStore: store,
      loadingState: SdkLoadingState.Loaded,
    });
  }, [providerProps, authConfig]);

  if (!embedSettings) {
    return null;
  }

  if (
    !name ||
    embedSettings.componentName !== "metabase-data-app" ||
    getDataAppNameFromPath(embedSettings.path) !== name
  ) {
    return (
      <SdkIframeError message="The embedded data app does not match its URL." />
    );
  }

  if (
    embedSettings.isGuest ||
    embedSettings.useExistingUserSession ||
    embedSettings.guestEmbedProviderUri
  ) {
    return (
      <SdkIframeError message="Data app embeds require SSO authentication." />
    );
  }

  if (embedSettings.apiKey) {
    return (
      <SdkIframeError message="Data app embeds require SSO authentication." />
    );
  }

  if (!PLUGIN_EMBEDDING_IFRAME_SDK.isEnabled()) {
    return (
      <SdkIframeError message="A valid license is required for embedding." />
    );
  }

  return (
    <ComponentProvider
      {...providerProps}
      authConfig={authConfig}
      locale={embedSettings.locale}
      reduxStore={store}
      isLocalHost={embedSettings._isLocalhost}
    >
      <AuthenticatedDataApp name={name} onProviderProps={setProviderProps} />
    </ComponentProvider>
  );
}

function AuthenticatedDataApp({
  name,
  onProviderProps,
}: {
  name: string;
  onProviderProps: (props: DataAppMetabaseProviderProps) => void;
}) {
  const loginStatus = useSdkSelector(getLoginStatus);

  if (loginStatus.status === "error") {
    return <SdkIframeError message={loginStatus.error.message} />;
  }

  if (loginStatus.status !== "success") {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  return <EmbeddedBundle name={name} onProviderProps={onProviderProps} />;
}

function EmbeddedBundle({
  name,
  onProviderProps,
}: {
  name: string;
  onProviderProps: (props: DataAppMetabaseProviderProps) => void;
}) {
  const { data, failed, error } = useDataAppBundle(name, { embedded: true });

  useEffect(() => {
    if (data) {
      onProviderProps(data.providerProps);
    }
  }, [data, onProviderProps]);

  if (failed) {
    return (
      <SdkIframeError message={error ?? "Unable to load this data app."} />
    );
  }

  if (!data) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  const App = data.component;

  return (
    <BundleErrorBoundary embedded>
      <App />
    </BundleErrorBoundary>
  );
}
