import type { State } from "metabase-types/store";

import type { ReportsState } from "./reports.slice";

export interface ReportsStoreState extends State {
  plugins: {
    reports: ReportsState;
  };
}
