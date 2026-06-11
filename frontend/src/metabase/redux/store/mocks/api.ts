import { Api } from "metabase/api/api";
import type { State } from "metabase/redux/store";

export const createMockApiState = (): State["metabase-api"] =>
  Api.reducer(undefined, { type: "@@INIT" });
