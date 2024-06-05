// Storybook helpers
import { Provider } from "react-redux";

import { mainReducers } from "metabase/reducers-main";

import { getStore } from "./entities-store";

export const ReduxProvider = ({
  children,
  storeInitialState = {},
}: {
  children: React.ReactNode;
  storeInitialState?: Record<string, any>;
}) => (
  <Provider store={getStore(mainReducers, storeInitialState)}>
    {children}
  </Provider>
);
