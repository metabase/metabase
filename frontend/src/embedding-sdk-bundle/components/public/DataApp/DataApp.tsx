import { type CSSProperties, useId, useMemo } from "react";

import { PublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkError";
import { useMetabaseProviderPropsStore } from "embedding-sdk-bundle/lib/provider-props-store";
import { useSdkStore } from "embedding-sdk-bundle/store";
import {
  getDataAppEmbedUrl,
  getEmbeddedAppSlugFromPath,
  normalizeDataAppPath,
} from "embedding-sdk-shared/lib/embedded-data-app-path";
import { getErrorMessage } from "metabase/api/utils/errors";

import { DataAppFrame } from "./DataAppFrame";

/** @category DataApp */
export interface DataAppProps {
  /**
   * App slug and optional route/query, such as `my-store/orders?active=true`.
   *
   * Changing only the route or query navigates within the app.
   * Changing the app slug remounts the iframe.
   *
   * To navigate back to a page after the user navigates inside the app,
   * keep `path` in state and update it with `onPathChange`.
   **/
  path: string;

  /**
   * Called with the new path whenever the app's page changes, for example
   * when the user clicks a `DataAppLink`.
   *
   * The path has the same format as `path`, such as `my-store/orders/42?tab=items`.
   *
   * It is not called when the host changes the `path` prop manually.
   *
   * @example
   * ```tsx
   * const [path, setPath] = useState("my-store/orders");
   *
   * <>
   *   <button onClick={() => setPath("my-store/orders")}>Orders</button>
   *   <DataApp path={path} onPathChange={setPath} />
   * </>
   * ```
   **/
  onPathChange?: (path: string) => void;

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
      const slug = getEmbeddedAppSlugFromPath(path);

      if (!slug) {
        return { error: "A valid data app path must be provided." };
      }

      const url = getDataAppEmbedUrl(instanceUrl, path);

      // Enable parallel loading of multiple data app embeds on the same page
      url.searchParams.set("embed-js-identifier", `react-data-app-${id}`);

      return {
        // Remount the iframe only when the app slug or instance URL changes.
        // Route and query changes trigger client-side routing instead.
        frameKey: getDataAppEmbedUrl(instanceUrl, slug).href,

        initialSrc: url.href,
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
      key={route.frameKey}
      {...props}
      path={route.path}
      origin={route.origin}
      initialSrc={route.initialSrc}
      authConfig={authConfig}
      store={reduxStore}
      locale={providerProps?.locale}
    />
  );
}
