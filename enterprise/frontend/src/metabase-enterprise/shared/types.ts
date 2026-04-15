import type { State } from "metabase/redux/store";

import type { EnterpriseSharedState } from "./reducer";

export interface EnterpriseState extends State {
  plugins: {
    shared: EnterpriseSharedState;
  };
}
