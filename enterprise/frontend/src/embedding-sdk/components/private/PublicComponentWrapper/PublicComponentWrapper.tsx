import React, { type CSSProperties } from "react";
import { t } from "ttag";

import { PublicComponentStylesWrapper } from "embedding-sdk/components/private/PublicComponentStylesWrapper";
import { useSdkSelector } from "embedding-sdk/store";
import { getLoginStatus, getUsageProblem } from "embedding-sdk/store/selectors";

import { SdkError } from "../SdkError";

import { SdkLoader } from "./SdkLoader";

type PublicComponentWrapperProps = {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
};
export const PublicComponentWrapper = React.forwardRef<
  HTMLDivElement,
  PublicComponentWrapperProps
>(function PublicComponentWrapper({ children, className, style }, ref) {
  const loginStatus = useSdkSelector(getLoginStatus);
  const usageProblem = useSdkSelector(getUsageProblem);

  let content = children;

  if (loginStatus.status === "uninitialized") {
    content = <div>{t`Initializing…`}</div>;
  }

  if (loginStatus.status === "validated") {
    content = <SdkLoader />
  }

  if (loginStatus.status === "loading") {
    content = <SdkLoader />;
  }

  if (loginStatus.status === "error") {
    content = <SdkError {...loginStatus.data} />;
  }

  // TODO: Put this in the errors?
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
