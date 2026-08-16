import type { Store } from "@reduxjs/toolkit";
import type { PropsWithChildren } from "react";
import {
  Provider,
  // eslint-disable-next-line no-restricted-imports
  connect as _connect,
} from "react-redux";

import { metabaseReduxContext } from "metabase/api/context";

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
