import {
  createApi,
  fetchBaseQuery,
  skipToken,
} from "@reduxjs/toolkit/query/react";
export { skipToken };

import { TAG_TYPES } from "./tags";

export const server = process.env.REACT_APP_SERVER;

export const FeedbackApi = createApi({
  reducerPath: "feedback-api",
  tagTypes: TAG_TYPES,
  baseQuery: fetchBaseQuery({
    baseUrl: server,
    prepareHeaders: headers => {
      headers.set("Content-Type", "application/json");
      return headers;
    },
  }),
  endpoints: () => ({}),
});
