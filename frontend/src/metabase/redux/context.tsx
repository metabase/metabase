import type { Store } from "@reduxjs/toolkit";
import { type PropsWithChildren, createContext } from "react";
import {
  Provider,
  type ReactReduxContextValue,
  // eslint-disable-next-line no-restricted-imports
  connect as _connect,
} from "react-redux";

export const metabaseReduxContext =
  createContext<ReactReduxContextValue | null>(null);

export const MetabaseReduxProvider = ({
  children,
  store,
}: PropsWithChildren<{ store: Store }>) => {
  return (
    <Provider store={store} context={metabaseReduxContext}>
      {children}
    </Provider>
  );
};

export const connect: typeof _connect = (
  mapStateToProps?: any,
  mapDispatchToProps?: any,
  mergeProps?: any,
  options?: any,
) => {
  return _connect(mapStateToProps, mapDispatchToProps, mergeProps, {
    context: metabaseReduxContext,
    ...options,
  });
};
