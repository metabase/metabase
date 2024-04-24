import { updateSetting } from "metabase/admin/settings/settings";
import { createAsyncThunk } from "metabase/lib/redux";
import type { EmbeddingHomepageDismissReason } from "metabase-types/api";

import { trackEmbeddingHomepageDismissed } from "./analytics";

export const dismissEmbeddingHomepage = createAsyncThunk(
  "metabase/embedding-homepage/dismiss",
  async (reason: EmbeddingHomepageDismissReason, { dispatch }) => {
    dispatch(updateSetting({ key: "embedding-homepage", value: reason }));
    trackEmbeddingHomepageDismissed(reason);
  },
);
