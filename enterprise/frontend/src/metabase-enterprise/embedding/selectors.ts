import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";
import { getPlan } from "metabase/utils/plan";

export const isInteractiveEmbeddingEnabled = (state: State) => {
  const plan = getPlan(getSetting(state, "token-features"));
  return plan === "pro-cloud" || plan === "pro-self-hosted";
};
