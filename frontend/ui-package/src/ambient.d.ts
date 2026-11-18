// Asset and CSS-module shims for type-checking /ui sources. Not shipped.
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "*.svg?component" {
  import type { FC, SVGProps } from "react";
  const Component: FC<SVGProps<SVGSVGElement>>;
  export default Component;
}

// Set by the Metabase app; /ui reads only these two keys, defensively.
interface Window {
  MetabaseBootstrap?: {
    "token-features"?: Record<string, boolean | undefined>;
    "application-colors"?: Record<string, string | undefined>;
  };
}
