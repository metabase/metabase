import { getPlan } from "metabase/common/utils/plan";
import { getSetting } from "metabase/selectors/settings";
import type { EnterpriseState } from "metabase-enterprise/settings/types";

export const isInteractiveEmbeddingEnabled = (state: EnterpriseState) => {
  const plan = getPlan(getSetting(state, "token-features"));
  return plan === "pro-cloud" || plan === "pro-self-hosted";
};
