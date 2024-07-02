import type { JSX } from "react";
import { t } from "ttag";

import { PublicComponentStylesWrapper } from "embedding-sdk/components/private/PublicComponentStylesWrapper";
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

  let content = children;

  if (loginStatus.status === "uninitialized") {
    content = <div>{t`Initializing…`}</div>;
  }

  if (loginStatus.status === "validated") {
    content = <div>{t`JWT is valid.`}</div>;
  }

  if (loginStatus.status === "loading") {
    content = <SdkLoader />;
  }

  if (loginStatus.status === "error") {
    content = <SdkError message={loginStatus.error.message} />;
  }

  return <PublicComponentStylesWrapper>{content}</PublicComponentStylesWrapper>;
};
