import type { JSX } from "react";

import type { SdkErrorProps } from "embedding-sdk/components/private/PublicComponentWrapper/SdkError";

export type SDKConfig = {
  metabaseInstanceUrl: string;
  jwtProviderUri: string;
  loaderComponent?: () => JSX.Element;
  errorComponent?: ({ message }: SdkErrorProps) => JSX.Element;
};
