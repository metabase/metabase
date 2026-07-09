import { PLUGIN_MULTI_FACTOR_AUTH } from "metabase/plugins";
import MetabaseSettings from "metabase/utils/settings";
import type { EnterpriseSettings } from "metabase-types/api";

import { AccountSecurityPanel } from "./AccountSecurityPanel";
import { MfaAuthCard } from "./MfaAuthCard";
import { MfaChallengeForm } from "./MfaChallengeForm";

export function initializePlugin() {
  // Components are registered without a feature check so backend enforcement that survives a
  // license lapse (fail-closed) keeps its UI: the challenge form and self-disable path stay
  // available even when the token feature is gone. Visibility instead follows the mfa-enabled
  // setting (public, in session properties): a lapse keeps it ON so enrolled users keep the
  // self-service UI, while an admin turning it OFF makes the gate a no-op, so hiding the dormant
  // tab loses nothing. New-setup UI (MfaAuthCard) additionally gates on the token feature.
  PLUGIN_MULTI_FACTOR_AUTH.isEnabled = () => isMfaEnabled();
  PLUGIN_MULTI_FACTOR_AUTH.ChallengeForm = MfaChallengeForm;
  PLUGIN_MULTI_FACTOR_AUTH.AccountSecurityPanel = AccountSecurityPanel;
  PLUGIN_MULTI_FACTOR_AUTH.AdminAuthCard = MfaAuthCard;
}

// mfa-enabled has :visibility :public so it rides in the same session-properties payload as OSS
// settings, but MetabaseSettings.get's key union only covers OSS Settings — hence the one
// localized cast. Widening SettingKey to EnterpriseSettings is the real fix (follow-up).
function isMfaEnabled(): boolean {
  const settings = MetabaseSettings as unknown as {
    get<K extends keyof EnterpriseSettings>(key: K): EnterpriseSettings[K];
  };
  return settings.get("mfa-enabled") === true;
}
