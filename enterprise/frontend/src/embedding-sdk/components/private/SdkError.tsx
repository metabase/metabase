import { t } from "ttag";

import { useSdkSelector } from "embedding-sdk/store";
import { getLoginStatus } from "embedding-sdk/store/selectors";
import type { LoginStatusError } from "embedding-sdk/store/types";

// TODO: Allow this component to be customizable by clients
export const SdkError = () => {
  const loginStatus = useSdkSelector(getLoginStatus) as LoginStatusError;

  return (
    <div>
      <div>{t`Error`}</div>
      <div>{loginStatus.error.message}</div>
    </div>
  );
};
