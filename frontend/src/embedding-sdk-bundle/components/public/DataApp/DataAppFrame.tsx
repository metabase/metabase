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

  isPathControlled: boolean;

  origin: string;

  /**
   * The URL the iframe first loads.
   *
   * Later values are ignored, so a route change does not reload the app.
   * `DataApp` keys this component by the app slug and instance URL, so it remounts when either changes.
   */
  initialSrc: string;

  locale?: string;
  store: SdkStore;
  authConfig: MetabaseAuthConfig;
}

export function DataAppFrame({
  height = DEFAULT_HEIGHT,
  width = "100%",
  className,
  style,
  ...frameOptions
}: DataAppFrameProps) {
  const { iframeRef, src, error } = useDataAppFrame(frameOptions);

  if (error) {
    return <SdkError message={error} />;
  }

  return (
    <iframe
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
