import React, { type CSSProperties } from "react";
import { t } from "ttag";

import { PublicComponentStylesWrapper } from "embedding-sdk/components/private/PublicComponentStylesWrapper";
import { SdkError } from "embedding-sdk/components/private/PublicComponentWrapper/SdkError";
import { SdkLoader } from "embedding-sdk/components/private/PublicComponentWrapper/SdkLoader";
import { useSdkSelector } from "embedding-sdk/store";
import { getLoginStatus, getUsageProblem } from "embedding-sdk/store/selectors";

import { useIsInSdkProvider } from "../SdkContext";

type PublicComponentWrapperProps = {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
};
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
  // metabase##50736: make sure we don't break the host app if for a render the
  // sdk components is rendered outside of the sdk provider
  const isInSdkProvider = useIsInSdkProvider();
  if (!isInSdkProvider) {
    // eslint-disable-next-line no-literal-metabase-strings -- error message
    return "This component requires the MetabaseProvider parent component. Please wrap it within <MetabaseProvider>...</MetabaseProvider> in your component tree.";
  }

  return <PublicComponentWrapperInner ref={ref} {...props} />;
});
