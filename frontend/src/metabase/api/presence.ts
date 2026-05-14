import { Api } from "./api";

export type PresenceModel = "card" | "dashboard";

export interface PresenceViewer {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

export interface PresencePingRequest {
  model: PresenceModel;
  model_id: number;
}

export interface PresencePingResponse {
  viewers: PresenceViewer[];
}

export const presenceApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    pingPresence: builder.mutation<PresencePingResponse, PresencePingRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/presence/ping",
        body,
      }),
    }),
    leavePresence: builder.mutation<void, PresencePingRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/presence/leave",
        body,
      }),
    }),
  }),
});

export const { usePingPresenceMutation, useLeavePresenceMutation } =
  presenceApi;
