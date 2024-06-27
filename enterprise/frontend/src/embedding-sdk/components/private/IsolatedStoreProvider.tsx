import {
  type ComponentType,
  type ReactNode,
  type FC,
  useState,
  useEffect,
} from "react";
import { Provider } from "react-redux";

import { sdkReducers, useSdkSelector } from "embedding-sdk/store";
import { getLoginStatus } from "embedding-sdk/store/selectors";
import { useStore } from "metabase/lib/redux";
import { getStore } from "metabase/store";

interface Props {
  children: ReactNode;
}

type Store = ReturnType<typeof getStore>;

export const IsolatedStoreProvider = ({ children }: Props) => {
  const store = useStore();
  const loginStatus = useSdkSelector(getLoginStatus);

  const [isolatedStore, setIsolatedStore] = useState<Store>();

  useEffect(() => {
    if (loginStatus.status === "success") {
      const inheritedState = store.getState();

      setIsolatedStore(getStore(sdkReducers, null, inheritedState));
    }
  }, [loginStatus, store]);

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
