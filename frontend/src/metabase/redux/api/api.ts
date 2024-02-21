import { createApi } from "@reduxjs/toolkit/query/react";

import { apiQuery } from "metabase/redux/utils";

import { API_KEY_TAG_TYPES } from "./api-keys";

export const Api = createApi({
  reducerPath: "metabase-api",
  tagTypes: [...API_KEY_TAG_TYPES], // TODO:
  baseQuery: apiQuery,
  endpoints: () => ({}),
});
