import fetchMock from "fetch-mock";

import type { ChannelApiResponse } from "metabase-types/api";
import type { DeepPartial } from "metabase/embedding-sdk/types/utils";

export const setupNotificationChannelsEndpoints = (
  channelData: DeepPartial<Required<ChannelApiResponse["channels"]>>,
) => {
  fetchMock.get("path:/api/pulse/form_input", { channels: channelData });
};
