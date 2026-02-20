import { combineReducers, configureStore } from "@reduxjs/toolkit";

import { Api } from "metabase/api";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";

const LOCATION_CHANGE = "@@router/LOCATION_CHANGE";

const toQuery = (search) => {
  if (!search) {
    return {};
  }

  const normalizedSearch = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(normalizedSearch);
  const query = {};

  for (const [key, value] of params.entries()) {
    query[key] = value;
  }

  return query;
};

const getWindowLocation = () => ({
  pathname: window.location.pathname,
  search: window.location.search,
  hash: window.location.hash,
  state: window.history.state,
  action: "POP",
  key: "",
  query: toQuery(window.location.search),
});

const routing = (
  state = { locationBeforeTransitions: getWindowLocation() },
  action,
) => {
  if (action?.type === LOCATION_CHANGE && action.payload) {
    return {
      ...state,
      locationBeforeTransitions: action.payload,
    };
  }

  return state;
};

export function getStore(reducers, _history, initialState) {
  const reducer = combineReducers({
    ...reducers,
    routing,
    [Api.reducerPath]: Api.reducer,
  });

  return configureStore({
    reducer,
    preloadedState: initialState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        immutableCheck: false,
        serializableCheck: false,
      }).concat([Api.middleware, ...PLUGIN_REDUX_MIDDLEWARES]),
  });
}
