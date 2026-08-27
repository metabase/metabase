import type { State } from "metabase/redux/store";
import { getPlan, getSetting } from "metabase/settings";

export const isInteractiveEmbeddingEnabled = (state: State) => {
  const plan = getPlan(getSetting(state, "token-features"));
  return plan === "pro-cloud" || plan === "pro-self-hosted";
};
