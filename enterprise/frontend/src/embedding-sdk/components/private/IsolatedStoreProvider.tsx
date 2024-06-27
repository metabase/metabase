import { type ComponentType, type ReactNode, type FC, useMemo } from "react";
import { Provider } from "react-redux";

import { sdkReducers, useSdkSelector } from "embedding-sdk/store";
import { getLoginStatus } from "embedding-sdk/store/selectors";
import { useStore } from "metabase/lib/redux";
import { getStore } from "metabase/store";

interface Props {
  children: ReactNode;
}

export const IsolatedStoreProvider = ({ children }: Props) => {
  const store = useStore();
  const loginStatus = useSdkSelector(getLoginStatus);

  // Capture the root store's initial state when the login status is successful.
  const isolatedStore = useMemo(
    () => {
      if (loginStatus.status !== "success") {
        return null;
      }

      return getStore(sdkReducers, null, store.getState());
    }, // eslint-disable-next-line react-hooks/exhaustive-deps
    [loginStatus],
  );

  if (!isolatedStore) {
    return children;
  }

  return <Provider store={isolatedStore}>{children}</Provider>;
};

export function withIsolatedStore<P extends object>(
  WrappedComponent: ComponentType<P>,
): FC<P> {
  const withIsolatedStore: FC<P> = props => (
    <IsolatedStoreProvider>
      <WrappedComponent {...props} />
    </IsolatedStoreProvider>
  );

  withIsolatedStore.displayName = `withIsolatedStore(${
    WrappedComponent.displayName || WrappedComponent.name || "Component"
  })`;

  return withIsolatedStore;
}
