import { ComponentType, ReactNode, useEffect, useMemo, useState } from "react";
import { Provider } from "react-redux";
import { getStore } from "metabase/store";
import { useSdkSelector, store, sdkReducers } from "embedding-sdk/store";
import { nanoid } from "@reduxjs/toolkit";

interface Props {
  children: ReactNode;
}

type Store = ReturnType<typeof getStore>;

export const IsolatedStoreProvider = ({ children }: Props) => {
  const token = useSdkSelector(s => s.sdk.token.token?.id);
  const isLoggedIn = useSdkSelector(s => s.sdk.loginStatus.status);

  const [instanceId, setInstanceId] = useState("");
  const [isolatedStore, setIsolatedStore] = useState<Store>();

  useEffect(() => {
    const id = nanoid();
    setInstanceId(id);

    console.log("(fx:mount)", id);

    return () => {
      console.log("(fx:cleanup)", id);
    };
  }, []);

  useEffect(() => {
    if (!instanceId) return;

    const inheritedState = store.getState();
    console.log("(fx:set:store)", instanceId);

    setIsolatedStore(getStore(sdkReducers, null, inheritedState));
  }, [instanceId]);

  if (isLoggedIn !== "success") return null;
  if (!isolatedStore) return null;

  console.log("(fx:render)");

  return <Provider store={isolatedStore}>{children}</Provider>;
};

export function withIsolatedStore<P extends object>(
  WrappedComponent: ComponentType<P>,
): React.FC<P> {
  const withIsolatedStore: React.FC<P> = props => {
    return (
      <IsolatedStoreProvider>
        <WrappedComponent {...props} />
      </IsolatedStoreProvider>
    );
  };

  withIsolatedStore.displayName = `withIsolatedStore(${
    WrappedComponent.displayName || WrappedComponent.name || "Component"
  })`;

  return withIsolatedStore;
}
