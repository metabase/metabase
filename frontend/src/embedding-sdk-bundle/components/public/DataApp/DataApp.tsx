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

/** Embed an existing data app by iframe. */
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

  // TODO(DAT-18): support API keys on localhost
  if (authConfig?.isGuest || authConfig?.apiKey) {
    return (
      <SdkError message="Guest embedding and API keys are not supported for data apps." />
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
      key={route.src}
      {...props}
      {...route}
      authConfig={authConfig}
      store={reduxStore}
      locale={providerProps?.locale}
    />
  );
}
