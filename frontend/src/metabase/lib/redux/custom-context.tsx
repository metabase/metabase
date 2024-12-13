import type { Store } from "@reduxjs/toolkit";
import { createContext } from "react";
import { Provider, ReactReduxContext } from "react-redux";
// eslint-disable-next-line no-restricted-imports
import * as ReactRedux from "react-redux";

import { isEmbeddingSdk } from "metabase/env";

export const MetabaseReduxContext = isEmbeddingSdk
  ? createContext<any>(null)
  : ReactReduxContext;

export const MetabaseReduxProvider = ({
  children,
  store,
}: React.PropsWithChildren & { store: Store }) => {
  return (
    <Provider store={store} context={MetabaseReduxContext}>
      {children}
    </Provider>
  );
};

export const connect: typeof ReactRedux.connect = (
  mapStateToProps?: any,
  mapDispatchToProps?: any,
  mergeProps?: any,
  options?: any,
) => {
  return ReactRedux.connect(mapStateToProps, mapDispatchToProps, mergeProps, {
    context: MetabaseReduxContext,
    ...options,
  });
};
