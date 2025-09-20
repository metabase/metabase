import type { EnterpriseSharedState } from "metabase-enterprise/shared/reducer";
import type { EnterpriseState } from "metabase-enterprise/shared/types";

import type { MetabotState } from "./reducer";

export interface MetabotStoreState extends EnterpriseState {
  plugins: {
    shared: EnterpriseSharedState;
    metabotPlugin: MetabotState;
  };
}

export interface SlashCommand {
  cmd: string;
  args: string[];
}
