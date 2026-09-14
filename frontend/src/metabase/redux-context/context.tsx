import type { Store } from "@reduxjs/toolkit";
import { type PropsWithChildren, createContext } from "react";
import { Provider, type ReactReduxContextValue } from "react-redux";

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
