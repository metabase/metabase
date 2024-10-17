import type { EnterpriseState } from "metabase-enterprise/shared/types";

import type { MetabotState } from "./reducer";

export interface MetabotStoreState extends EnterpriseState {
  plugins: {
    metabotPlugin: MetabotState;
  };
}
