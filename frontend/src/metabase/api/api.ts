import { createApi, skipToken } from "@reduxjs/toolkit/query/react";
export { skipToken };

import { apiQuery } from "./query";
import { TAG_TYPES } from "./tags";

export const Api = createApi({
  reducerPath: "metabase-api",
  tagTypes: TAG_TYPES,
  baseQuery: apiQuery,
  endpoints: () => ({}),
});
