import type { Store } from "@reduxjs/toolkit";
import { createContext } from "react";
import {
  Provider,
  // eslint-disable-next-line no-restricted-imports
  connect as _connect,
} from "react-redux";

export const MetabaseReduxContext = createContext<any>(null);

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

export const connect: typeof _connect = (
  mapStateToProps?: any,
  mapDispatchToProps?: any,
  mergeProps?: any,
  options?: any,
) => {
  return _connect(mapStateToProps, mapDispatchToProps, mergeProps, {
    context: MetabaseReduxContext,
    ...options,
  });
};
