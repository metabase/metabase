import type { AnyAction, Store, ThunkDispatch } from "@reduxjs/toolkit";

import { tokenReducer } from "embedding-sdk/store/reducer";
import reducers from "metabase/reducers-main";
import { getStore } from "metabase/store";

const SDK_REDUCERS = {
  ...reducers,
  embeddingSessionToken: tokenReducer,
};

export type RootState = ReturnType<typeof SDK_REDUCERS>;
export type AppThunkDispatch = ThunkDispatch<RootState, any, AnyAction>;
export type AppStore = Omit<Store<RootState, AnyAction>, "dispatch"> & {
  dispatch: AppThunkDispatch;
};

const store: AppStore = getStore(SDK_REDUCERS);

export { store };
