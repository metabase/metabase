import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkError";
import { useDataAppFrame } from "embedding-sdk-bundle/hooks/private/data-apps/use-data-app-frame";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-shared/types/auth-config";

import type { DataAppProps } from "./DataApp";

// Matches metabase-data-app web component's default height
const DEFAULT_HEIGHT = 600;

interface DataAppFrameProps extends Omit<DataAppProps, "initialPath" | "path"> {
  path: string;
  slug: string;

  /** Whether the host passed `path`, so it can navigate the app. */
  isPathControlled: boolean;

  origin: string;

  /**
   * The URL the iframe first loads.
   *
   * Later values are ignored, so a route change does not reload the app.
   * `DataApp` keys this component by the app slug and instance URL, so it remounts when either changes.
   * When only the route or query changes, the iframe is asked to navigate client-side.
   */
  initialSrc: string;

  locale?: string;
  store: SdkStore;
  authConfig: MetabaseAuthConfig;
}

export function DataAppFrame({
  path,
  slug,
  isPathControlled,
  origin,
  initialSrc,
  onPathChange,
  locale,
  store,
  authConfig,
  height = DEFAULT_HEIGHT,
  width = "100%",
  className,
  style,
}: DataAppFrameProps) {
  const { iframeRef, iframeKey, src, error } = useDataAppFrame({
    path,
    slug,
    isPathControlled,
    origin,
    initialSrc,
    onPathChange,
    locale,
    store,
    authConfig,
  });

  if (error) {
    return <SdkError message={error} />;
  }

  return (
    <iframe
      key={iframeKey}
      ref={iframeRef}
      src={src}
      className={className}
      allow="clipboard-write"
      data-testid="data-app-frame"
      data-metabase-embed="true"
      style={{ border: 0, display: "block", width, height, ...style }}
    />
  );
}
