import { useEffect, useRef, type ComponentType } from "react";
import { Provider } from "react-redux";

import { sdkReducers, store, useSdkSelector } from "embedding-sdk/store";
import { getSessionTokenState } from "embedding-sdk/store/selectors";
import { getStore } from "metabase/store";

import { PublicComponentWrapper } from "./PublicComponentWrapper";

type Store = ReturnType<typeof getStore>;

export function withPublicComponentWrapper<P extends object>(
  WrappedComponent: ComponentType<P>,
): React.FC<P> {
  const WithPublicComponentWrapper: React.FC<P> = props => {
    const token = useSdkSelector(getSessionTokenState);

    const isolatedStore = useRef<Store>();

    // HACK: refresh the internal store when the token changes
    useEffect(() => {
      isolatedStore.current = getStore(sdkReducers, null, store.getState());
    }, [token]);

    return (
      <Provider store={isolatedStore.current}>
        <PublicComponentWrapper>
          <WrappedComponent {...props} />
        </PublicComponentWrapper>
      </Provider>
    );
  };

  WithPublicComponentWrapper.displayName = `withPublicComponentWrapper(${
    WrappedComponent.displayName || WrappedComponent.name || "Component"
  })`;

  return WithPublicComponentWrapper;
}
