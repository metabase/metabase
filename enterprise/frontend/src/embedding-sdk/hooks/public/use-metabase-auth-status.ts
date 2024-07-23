import { useContext } from "react";
import { ReactReduxContext } from "react-redux";
import { t } from "ttag";

import { useSdkSelector } from "embedding-sdk/store";
import { getLoginStatus } from "embedding-sdk/store/selectors";

// eslint-disable-next-line no-literal-metabase-strings -- this string only shows in the console.
export const USE_OUTSIDE_OF_CONTEXT_MESSAGE = t`The useMetabaseAuthStatus hook must be used within a component wrapped by the MetabaseProvider`;

export function useMetabaseAuthStatus() {
  const context = useContext(ReactReduxContext);

  if (!context) {
    throw new Error(USE_OUTSIDE_OF_CONTEXT_MESSAGE);
  }

  return useSdkSelector(getLoginStatus);
}
