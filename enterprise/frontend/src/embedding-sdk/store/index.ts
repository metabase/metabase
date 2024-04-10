import type { Store } from "@reduxjs/toolkit";

import { tokenReducer } from "embedding-sdk/store/reducer";
import type { SdkState } from "embedding-sdk/store/types";
import reducers from "metabase/reducers-main";
import { getStore } from "metabase/store";

const SDK_REDUCERS = {
  ...reducers,
  embeddingSessionToken: tokenReducer,
};

export const store = getStore(SDK_REDUCERS) as unknown as Store<SdkState>;
