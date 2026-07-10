import { PLUGIN_MULTI_FACTOR_AUTH } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { AccountSecurityPanel } from "./components/AccountSecurityPanel";
import { AdminAuthCard } from "./components/AdminAuthCard";
import { ChallengeForm } from "./components/ChallengeForm";

export function initializePlugin() {
  PLUGIN_MULTI_FACTOR_AUTH.isEnabled = () =>
    Boolean(hasPremiumFeature("multi-factor-auth"));
  PLUGIN_MULTI_FACTOR_AUTH.ChallengeForm = ChallengeForm;
  PLUGIN_MULTI_FACTOR_AUTH.AccountSecurityPanel = AccountSecurityPanel;
  PLUGIN_MULTI_FACTOR_AUTH.AdminAuthCard = AdminAuthCard;
}
