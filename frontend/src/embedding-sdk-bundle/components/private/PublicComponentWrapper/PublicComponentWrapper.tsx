import { type ReactNode, forwardRef } from "react";

import { PublicComponentStylesWrapper } from "embedding-sdk-bundle/components/private/PublicComponentStylesWrapper";
import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkError";
import { SdkLoader } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkLoader";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import {
  getInitStatus,
  getUsageProblem,
} from "embedding-sdk-bundle/store/selectors";
import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";

export type PublicComponentWrapperProps = {
  children: ReactNode;
} & CommonStylingProps;

export const PublicComponentWrapper = forwardRef<
  HTMLDivElement,
  PublicComponentWrapperProps
>(function PublicComponentWrapper({ children, className, style }, ref) {
  const initStatus = useSdkSelector(getInitStatus);
  const usageProblem = useSdkSelector(getUsageProblem);

  let content = children;

  if (
    initStatus.status === "uninitialized" ||
    initStatus.status === "loading"
  ) {
    content = <SdkLoader />;
  }

  if (initStatus.status === "error") {
    content = (
      <SdkError message={initStatus.error.message} error={initStatus.error} />
    );
  }

  // The SDK components should not load if there is a license error.
  if (usageProblem?.severity === "error") {
    content = null;
  }

  return (
    <PublicComponentStylesWrapper className={className} style={style} ref={ref}>
      {content}
    </PublicComponentStylesWrapper>
  );
});
