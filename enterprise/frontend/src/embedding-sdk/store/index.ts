import { tokenReducer } from "embedding-sdk/store/reducer";
import reducers from "metabase/reducers-main";
import { getStore } from "metabase/store";

const SDK_REDUCERS = {
  ...reducers,
  embeddingSessionToken: tokenReducer,
};
const store = getStore(SDK_REDUCERS);

export { store };
