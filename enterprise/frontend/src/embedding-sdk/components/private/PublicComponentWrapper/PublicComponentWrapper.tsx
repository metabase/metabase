import React, { type CSSProperties } from "react";
import { t } from "ttag";

import { PublicComponentStylesWrapper } from "embedding-sdk/components/private/PublicComponentStylesWrapper";
import { SdkError } from "embedding-sdk/components/private/PublicComponentWrapper/SdkError";
import { SdkLoader } from "embedding-sdk/components/private/PublicComponentWrapper/SdkLoader";
import { useSdkSelector } from "embedding-sdk/store";
import { getLoginStatus, getUsageProblem } from "embedding-sdk/store/selectors";

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

  if (loginStatus.status === "loading") {
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
