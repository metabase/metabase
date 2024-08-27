import {
  createApi,
  fetchBaseQuery,
  skipToken,
} from "@reduxjs/toolkit/query/react";
export { skipToken };

import { TAG_TYPES } from "./tags";

export const semantic = "http://localhost:3000";

export const FeedbackApi = createApi({
  reducerPath: "feedback-api",
  tagTypes: TAG_TYPES,
  baseQuery: fetchBaseQuery({
    baseUrl: semantic,
    prepareHeaders: headers => {
      headers.set("Content-Type", "application/json");
      return headers;
    },
  }),
  endpoints: () => ({}),
});
