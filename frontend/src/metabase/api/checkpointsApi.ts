import {
  createApi,
  fetchBaseQuery,
  skipToken,
} from "@reduxjs/toolkit/query/react";
export { skipToken };

import { TAG_TYPES } from "./tags";

export const server = process.env.REACT_APP_SERVER;

export const CheckpointsApi = createApi({
  reducerPath: "checkpoints-api",
  tagTypes: TAG_TYPES,
  baseQuery: fetchBaseQuery({
    baseUrl: server,
  }),
  endpoints: () => ({}),
});
