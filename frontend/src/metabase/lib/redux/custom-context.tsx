import type { Store } from "@reduxjs/toolkit";
import { createContext } from "react";
import { Provider } from "react-redux";
// eslint-disable-next-line no-restricted-imports
import * as ReactRedux from "react-redux";

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

type ConnectArgs = Parameters<typeof ReactRedux.connect>;

export const connect = (
  mapStateToProps: ConnectArgs[0],
  mapDispatchToProps: ConnectArgs[1],
  ownProps: ConnectArgs[2],
  options: ConnectArgs[3],
) => {
  return ReactRedux.connect(mapStateToProps, mapDispatchToProps, ownProps, {
    context: MetabaseReduxContext,
    ...options,
  });
};
