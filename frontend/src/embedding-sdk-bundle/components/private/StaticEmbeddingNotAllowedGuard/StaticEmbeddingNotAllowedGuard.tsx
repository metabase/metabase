import type { PropsWithChildren } from "react";
import { t } from "ttag";

import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsStaticEmbedding } from "embedding-sdk-bundle/store/selectors";

/**
 * A wrapper component that renders its children for non-static embedding only
 */
export const StaticEmbeddingNotAllowedGuard = ({
  children,
}: PropsWithChildren) => {
  const isStatic = useSdkSelector(getIsStaticEmbedding);

  return !isStatic ? (
    children
  ) : (
    <SdkError message={t`Static Embedding is not allowed for this component`} />
  );
};
