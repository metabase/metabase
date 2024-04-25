import type { JSX } from "react";
import { t } from "ttag";

import { SdkError } from "embedding-sdk/components/private/PublicComponentWrapper/SdkError";
import { SdkLoader } from "embedding-sdk/components/private/PublicComponentWrapper/SdkLoader";
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
    return <SdkLoader />;
  }

  if (loginStatus.status === "error") {
    return <SdkError message={loginStatus.error.message} />;
  }

  return children;
};
