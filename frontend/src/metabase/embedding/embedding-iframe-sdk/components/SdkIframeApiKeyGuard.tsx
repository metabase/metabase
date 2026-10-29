import type { ReactNode } from "react";

import { getIsLocalhostOrigin } from "embedding-sdk-shared/lib/get-is-localhost";

import { SdkIframeApiKeyInProductionError } from "./SdkIframeError";

type SdkIframeApiKeyGuardProps = {
  apiKey?: string;
  parentOrigin: string | null;
  children: ReactNode;
};

export function SdkIframeApiKeyGuard({
  apiKey,
  parentOrigin,
  children,
}: SdkIframeApiKeyGuardProps) {
  if (apiKey && !getIsLocalhostOrigin(parentOrigin)) {
    return <SdkIframeApiKeyInProductionError />;
  }

  return children;
}
