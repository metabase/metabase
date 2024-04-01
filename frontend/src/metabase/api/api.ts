import { createApi } from "@reduxjs/toolkit/query/react";

import { apiQuery } from "./query";
import { TAG_TYPES } from "./tags";

export const Api = createApi({
  reducerPath: "metabase-api",
  tagTypes: TAG_TYPES,
  baseQuery: apiQuery,
  endpoints: () => ({}),
});
