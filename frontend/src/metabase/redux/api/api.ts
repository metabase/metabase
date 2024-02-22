import { createApi } from "@reduxjs/toolkit/query/react";

import { apiQuery } from "metabase/redux/utils";

import { tagTypes } from "./tags";

export const Api = createApi({
  reducerPath: "metabase-api",
  tagTypes,
  baseQuery: apiQuery,
  endpoints: () => ({}),
});
