import { createApi, fetchBaseQuery, skipToken } from "@reduxjs/toolkit/query/react";
export { skipToken };

import { TAG_TYPES } from "./tags";

export const CubeApi = createApi({
  reducerPath: "cube-api",
  tagTypes: TAG_TYPES,
  baseQuery: fetchBaseQuery({baseUrl: "http://localhost:3001"}),
  endpoints: () => ({}),
});
