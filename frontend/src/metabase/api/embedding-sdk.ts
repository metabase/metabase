import type { SdkReact18Host } from "metabase-types/api";

import { Api } from "./api";

export const embeddingSdkApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listSdkReact18Hosts: builder.query<SdkReact18Host[], void>({
      query: () => `/api/embedding-sdk/react-18-hosts`,
    }),
  }),
});

export const { useListSdkReact18HostsQuery } = embeddingSdkApi;
