import fetchMock from "fetch-mock";

import type { DeepPartial } from "metabase/embedding-sdk/types/utils";
import type {
  ChannelApiResponse,
  UnsubscribeResponse,
} from "metabase-types/api";

export const setupNotificationChannelsEndpoints = (
  channelData: DeepPartial<Required<ChannelApiResponse["channels"]>>,
) => {
  fetchMock.get("path:/api/pulse/form_input", { channels: channelData });
};

export const setupUnsubscribeFromPulseEndpoint = (
  response: UnsubscribeResponse,
  { status = 200 }: { status?: number } = {},
) => {
  fetchMock.post("path:/api/pulse/unsubscribe", { status, body: response });
};

export const setupUndoUnsubscribeFromPulseEndpoint = (
  response: UnsubscribeResponse,
) => {
  fetchMock.post("path:/api/pulse/unsubscribe/undo", response);
};
