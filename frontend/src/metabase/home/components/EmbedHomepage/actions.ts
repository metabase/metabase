import { createAsyncThunk } from "metabase/redux/utils";
import { settingsApi } from "metabase/settings";
import type { EmbeddingHomepageDismissReason } from "metabase-types/api";

import { trackEmbeddingHomepageDismissed } from "./analytics";

export const dismissEmbeddingHomepage = createAsyncThunk(
  "metabase/embedding-homepage/dismiss",
  async (reason: EmbeddingHomepageDismissReason, { dispatch }) => {
    dispatch(
      settingsApi.endpoints.updateSetting.initiate({
        key: "embedding-homepage",
        value: reason,
      }),
    );
    trackEmbeddingHomepageDismissed(reason);
  },
);
