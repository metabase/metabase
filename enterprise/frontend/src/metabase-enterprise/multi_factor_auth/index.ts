import { PLUGIN_MULTI_FACTOR_AUTH } from "metabase/plugins";

import { AccountSecurityPanel } from "./AccountSecurityPanel";
import { MfaAuthCard } from "./MfaAuthCard";
import { MfaChallengeForm } from "./MfaChallengeForm";

export function initializePlugin() {
  // Registered without a feature check: backend 2FA enforcement survives a
  // license lapse (fail-closed), so the challenge form and the self-disable UI
  // must stay available too. New-setup-only UI gates itself on the token
  // feature (MfaAuthCard via useHasTokenFeature).
  PLUGIN_MULTI_FACTOR_AUTH.isEnabled = () => true;
  PLUGIN_MULTI_FACTOR_AUTH.ChallengeForm = MfaChallengeForm;
  PLUGIN_MULTI_FACTOR_AUTH.AccountSecurityPanel = AccountSecurityPanel;
  PLUGIN_MULTI_FACTOR_AUTH.AdminAuthCard = MfaAuthCard;
}
