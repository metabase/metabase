import { useMemo, type ComponentType } from "react";
import { Provider } from "react-redux";

import { sdkReducers, store, useSdkSelector } from "embedding-sdk/store";
import {
  getIsLoggedIn,
  getSessionTokenState,
} from "embedding-sdk/store/selectors";
import { getStore } from "metabase/store";

import { PublicComponentWrapper } from "./PublicComponentWrapper";

export function withPublicComponentWrapper<P extends object>(
  WrappedComponent: ComponentType<P>,
): React.FC<P> {
  const WithPublicComponentWrapper: React.FC<P> = props => {
    const token = useSdkSelector(getSessionTokenState);
    const isLoggedIn = useSdkSelector(getIsLoggedIn);

    // refresh the internal store when the token changes

    const isolatedStore = useMemo(
      () => {
        return getStore(sdkReducers, null, store.getState());
      }, // eslint-disable-next-line react-hooks/exhaustive-deps
      [token, isLoggedIn],
    );

    return (
      <Provider store={isolatedStore}>
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
