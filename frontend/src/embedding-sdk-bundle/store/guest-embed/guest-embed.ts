import { overrideRequestsForGuestEmbeds } from "metabase/embedding/lib/override-requests-for-embeds";
import { refreshSiteSettings } from "metabase/redux/settings";
import { createAsyncThunk } from "metabase/utils/redux";

export const initGuestEmbed = createAsyncThunk<void, undefined>(
  "sdk/token/INIT_GUEST_EMBED",
  async (_: any, { dispatch }) => {
    overrideRequestsForGuestEmbeds();
    await dispatch(refreshSiteSettings());
  },
);
