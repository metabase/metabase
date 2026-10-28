import { type CSSProperties, useId, useMemo } from "react";

import { PublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkError";
import { useMetabaseProviderPropsStore } from "embedding-sdk-bundle/lib/provider-props-store";
import { useSdkStore } from "embedding-sdk-bundle/store";
import {
  getDataAppEmbedUrl,
  normalizeDataAppPath,
  validateDataAppPath,
} from "embedding-sdk-shared/lib/embedded-data-app-path";
import { getIsLocalhost } from "embedding-sdk-shared/lib/get-is-localhost";
import { getErrorMessage } from "metabase/api/utils/errors";

import { DataAppFrame } from "./DataAppFrame";

/** @category DataApp */
export interface DataAppProps {
  /**
   * App slug and optional route/query, such as `my-store/orders?active=true`.
   * Changing the path remounts the iframe.
   **/
  path: string;

  className?: string;
  style?: CSSProperties;

  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
}

/** Embed a data app using provider SSO, or a local API key for development. */
export const DataApp = (props: DataAppProps) => (
  <PublicComponentWrapper height={props.height} width={props.width}>
    <DataAppInner {...props} />
  </PublicComponentWrapper>
);

function DataAppInner({ path, ...props }: DataAppProps) {
  const {
    state: { props: providerProps },
  } = useMetabaseProviderPropsStore();

  const id = useId();
  const reduxStore = useSdkStore();

  const authConfig = providerProps?.authConfig;
  const instanceUrl = authConfig?.metabaseInstanceUrl;

  const route = useMemo(() => {
    if (!instanceUrl) {
      return null;
    }

    try {
      validateDataAppPath(path);

      const url = getDataAppEmbedUrl(instanceUrl, path);

      // Enable parallel loading of multiple data app embeds on the same page
      url.searchParams.set("embed-js-identifier", `react-data-app-${id}`);

      return {
        src: url.href,
        origin: url.origin,
        path: normalizeDataAppPath(path),
      };
    } catch (error) {
      return { error: getErrorMessage(error, String(error)) };
    }
  }, [instanceUrl, path, id]);

  if (authConfig?.isGuest) {
    return <SdkError message="Guest embeds are not supported for data apps." />;
  }

  if (authConfig?.apiKey && !getIsLocalhost()) {
    return (
      <SdkError message="Using an API key in production is not allowed." />
    );
  }

  if (route?.error !== undefined) {
    return <SdkError message={route.error} />;
  }

  if (!route || !authConfig) {
    return null;
  }

  return (
    <DataAppFrame
      // TODO(DAT-74): apply client-side routing when slug does not change
      key={`${route.src}:${authConfig.apiKey ?? "sso"}`}
      {...props}
      {...route}
      authConfig={authConfig}
      store={reduxStore}
      locale={providerProps?.locale}
    />
  );
}
