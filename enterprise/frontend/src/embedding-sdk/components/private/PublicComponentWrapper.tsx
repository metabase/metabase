import { t } from "ttag";

import { SdkError } from "embedding-sdk/components/private/SdkError";
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

  if (loginStatus.status === "initialized") {
    return <div>{t`API Key / JWT is valid.`}</div>;
  }

  if (loginStatus.status === "loading") {
    return <div>{t`Loading`}</div>;
  }

  if (loginStatus.status === "error") {
    return <SdkError />;
  }

  return children;
};
