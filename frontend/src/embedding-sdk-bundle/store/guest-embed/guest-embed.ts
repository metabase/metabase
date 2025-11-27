import { overrideRequestsForGuestEmbeds } from "embedding-sdk-bundle/lib/override-requests-for-guest-embeds";
import { createAsyncThunk } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";

export const initGuestEmbed = createAsyncThunk(
  "sdk/token/INIT_GUEST_EMBED",
  async ({ isGuestEmbed }: { isGuestEmbed?: boolean | null }, { dispatch }) => {
    if (!isGuestEmbed) {
      return;
    }

    overrideRequestsForGuestEmbeds();
    await dispatch(refreshSiteSettings());
  },
);
