import { type ComponentType, type ReactNode, type FC, useMemo } from "react";
import { Provider } from "react-redux";

import { useSdkSelector, store, sdkReducers } from "embedding-sdk/store";
import { getStore } from "metabase/store";

interface Props {
  children: ReactNode;
}

export const IsolatedStoreProvider = ({ children }: Props) => {
  const isLoggedIn = useSdkSelector(s => s.sdk.loginStatus.status);

  const isolatedStore = useMemo(() => {
    return getStore(sdkReducers, null, store.getState());
  }, []);

  if (isLoggedIn !== "success" || !isolatedStore) {
    return null;
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
