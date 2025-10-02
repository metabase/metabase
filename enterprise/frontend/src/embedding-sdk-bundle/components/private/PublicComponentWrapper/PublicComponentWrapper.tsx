import React from "react";
import { t } from "ttag";

import { PublicComponentStylesWrapper } from "embedding-sdk-bundle/components/private/PublicComponentStylesWrapper";
import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkError";
import { SdkLoader } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkLoader";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import {
  getLoginStatus,
  getUsageProblem,
} from "embedding-sdk-bundle/store/selectors";
import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";

import { RenderOnlyInSdkProvider } from "../SdkContext";

export type PublicComponentWrapperProps = {
  children: React.ReactNode;
} & CommonStylingProps;

const PublicComponentWrapperInner = React.forwardRef<
  HTMLDivElement,
  PublicComponentWrapperProps
>(function PublicComponentWrapper({ children, className, style }, ref) {
  const loginStatus = useSdkSelector(getLoginStatus);
  const usageProblem = useSdkSelector(getUsageProblem);

  let content = children;

  if (loginStatus.status === "uninitialized") {
    content = <div>{t`Initializing…`}</div>;
  }

  if (loginStatus.status === "loading") {
    content = <SdkLoader />;
  }

  if (loginStatus.status === "error") {
    content = (
      <SdkError message={loginStatus.error.message} error={loginStatus.error} />
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
