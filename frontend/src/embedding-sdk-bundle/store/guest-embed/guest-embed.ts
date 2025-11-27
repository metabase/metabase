import { overrideRequestsForGuestEmbeds } from "embedding-sdk-bundle/lib/override-requests-for-guest-embeds";
import { createAsyncThunk } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";

export const initGuestEmbed = createAsyncThunk<void, undefined>(
  "sdk/token/INIT_GUEST_EMBED",
  async (_: any, { dispatch }) => {
    overrideRequestsForGuestEmbeds();
    await dispatch(refreshSiteSettings());
  },
);
