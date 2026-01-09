import { overrideRequestsForGuestEmbeds } from "metabase/embedding/lib/override-requests-for-embeds";
import { createAsyncThunk } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";

export const initGuestEmbed = createAsyncThunk<void, undefined>(
  "sdk/token/INIT_GUEST_EMBED",
  async (_: any, { dispatch }) => {
    overrideRequestsForGuestEmbeds();
    await dispatch(refreshSiteSettings());
  },
);
