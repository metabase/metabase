import type { State } from "metabase-types/store";

import type { EnterpriseSharedState } from "./reducer";

export interface EnterpriseState extends State {
  plugins: {
    shared: EnterpriseSharedState;
  };
}
