import { updateSetting } from "metabase/admin/settings/settings";
import { createAsyncThunk } from "metabase/lib/redux";

import { trackEmbeddingHomepageDismissed } from "./analytics";
import type { EmbedHomepageDismissReason } from "./types";

export const dismissEmbeddingHomepage = createAsyncThunk(
  "metabase/embedding-homepage/dismiss",
  async (reason: EmbedHomepageDismissReason, { dispatch }) => {
    dispatch(updateSetting({ key: "embedding-homepage", value: reason }));
    trackEmbeddingHomepageDismissed(reason);
  },
);
