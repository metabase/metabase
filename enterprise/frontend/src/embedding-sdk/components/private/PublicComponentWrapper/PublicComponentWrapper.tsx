import React, { type ReactNode, forwardRef } from "react";

import { PublicComponentStylesWrapper } from "embedding-sdk/components/private/PublicComponentStylesWrapper";
import { SdkError } from "embedding-sdk/components/private/PublicComponentWrapper/SdkError";
import { SdkLoader } from "embedding-sdk/components/private/PublicComponentWrapper/SdkLoader";
import { useSdkSelector } from "embedding-sdk/store";
import { getLoginStatus, getUsageProblem } from "embedding-sdk/store/selectors";
import type { CommonStylingProps } from "embedding-sdk/types/props";

import { RenderOnlyInSdkProvider } from "../SdkContext";

export type PublicComponentWrapperProps = {
  children: ReactNode;
} & CommonStylingProps;

const PublicComponentWrapperInner = forwardRef<
  HTMLDivElement,
  PublicComponentWrapperProps
>(function PublicComponentWrapper({ children, className, style }, ref) {
  const loginStatus = useSdkSelector(getLoginStatus);
  const usageProblem = useSdkSelector(getUsageProblem);

  let content = children;

  if (
    loginStatus.status === "uninitialized" ||
    loginStatus.status === "loading"
  ) {
    content = <SdkLoader />;
  }

  if (loginStatus.status === "error") {
    content = <SdkError message={loginStatus.error.message} />;
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

export const PublicComponentWrapper = React.forwardRef<
  HTMLDivElement,
  PublicComponentWrapperProps
>(function PublicComponentWrapper(props, ref) {
  return (
    <RenderOnlyInSdkProvider>
      <PublicComponentWrapperInner ref={ref} {...props} />
    </RenderOnlyInSdkProvider>
  );
});
