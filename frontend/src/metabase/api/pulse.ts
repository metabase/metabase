import type {
  UnsubscribeRequest,
  UnsubscribeResponse,
} from "metabase-types/api";

import { Api } from "./api";

export const pulseApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    unsubscribeFromPulse: builder.mutation<
      UnsubscribeResponse,
      UnsubscribeRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/pulse/unsubscribe",
        body,
      }),
    }),
    undoUnsubscribeFromPulse: builder.mutation<
      UnsubscribeResponse,
      UnsubscribeRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/pulse/unsubscribe/undo",
        body,
      }),
    }),
  }),
});

export const {
  useUnsubscribeFromPulseMutation,
  useUndoUnsubscribeFromPulseMutation,
} = pulseApi;
