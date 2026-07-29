import { getPlan } from "metabase/common/utils/plan";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/selectors/settings";

export const isInteractiveEmbeddingEnabled = (state: State) => {
  const plan = getPlan(getSetting(state, "token-features"));
  return plan === "pro-cloud" || plan === "pro-self-hosted";
};
