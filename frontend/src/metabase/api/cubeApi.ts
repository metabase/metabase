import {
  createApi,
  fetchBaseQuery,
  skipToken,
} from "@reduxjs/toolkit/query/react";
export { skipToken };

import { TAG_TYPES } from "./tags";

export const semantic = process.env.REACT_APP_SEMANTIC;

export const CubeApi = createApi({
  reducerPath: "cube-api",
  tagTypes: TAG_TYPES,
  baseQuery: fetchBaseQuery({ baseUrl: semantic }),
  endpoints: () => ({}),
});
