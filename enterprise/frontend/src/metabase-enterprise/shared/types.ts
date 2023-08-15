import { State } from "metabase-types/store";
import { EnterpriseSharedState } from "./reducer";

export interface EnterpriseState extends State {
  plugins: {
    shared: EnterpriseSharedState;
  };
}
