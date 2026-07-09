import { PLUGIN_MULTI_FACTOR_AUTH } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { AccountSecurityPanel } from "./AccountSecurityPanel";
import { MfaAuthCard } from "./MfaAuthCard";
import { MfaChallengeForm } from "./MfaChallengeForm";

export function initializePlugin() {
  if (hasPremiumFeature("multi-factor-auth")) {
    PLUGIN_MULTI_FACTOR_AUTH.isEnabled = () => true;
    PLUGIN_MULTI_FACTOR_AUTH.ChallengeForm = MfaChallengeForm;
    PLUGIN_MULTI_FACTOR_AUTH.AccountSecurityPanel = AccountSecurityPanel;
    PLUGIN_MULTI_FACTOR_AUTH.AdminAuthCard = MfaAuthCard;
  }
}
