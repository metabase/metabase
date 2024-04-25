import type { JSX } from "react";
import { t } from "ttag";

import { SdkError } from "embedding-sdk/components/private/SdkError";
import { SdkLoader } from "embedding-sdk/components/private/SdkLoader";
import { useSdkSelector } from "embedding-sdk/store";
import { getLoginStatus } from "embedding-sdk/store/selectors";

export const PublicComponentWrapper = ({
  children,
}: {
  children: JSX.Element;
}) => {
  const loginStatus = useSdkSelector(getLoginStatus);

  if (loginStatus.status === "uninitialized") {
    return <div>{t`Initializing…`}</div>;
  }

  if (loginStatus.status === "validated") {
    return <div>{t`JWT is valid.`}</div>;
  }

  if (loginStatus.status === "loading") {
    return <PublicComponentWrapper.Loader />;
  }

  if (loginStatus.status === "error") {
    return <PublicComponentWrapper.Error message={loginStatus.error.message} />;
  }

  return children;
};

PublicComponentWrapper.Loader = SdkLoader;
PublicComponentWrapper.Error = SdkError;
