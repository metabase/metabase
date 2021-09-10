import requestsReducer from "metabase/redux/requests";
import { combineReducers, applyMiddleware, createStore, compose } from "redux";
import promise from "redux-promise";

import { thunkWithDispatchAction } from "metabase/store";
import * as entities from "metabase/redux/entities";

export function getStore(reducers = {}, initialState = {}) {
  const reducer = combineReducers({
    entities: entities.reducer,
    requests: (state, action) =>
      requestsReducer(entities.requestsReducer(state, action), action),
    ...reducers,
  });

  return createStore(
    reducer,
    initialState,
    compose(applyMiddleware(thunkWithDispatchAction, promise)),
  );
}
