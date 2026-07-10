import {
  NotFoundPlaceholder,
  PluginPlaceholder,
} from "metabase/plugins/components/PluginPlaceholder";
import type { MfaMethod } from "metabase-types/api";

export type MfaChallengeFormProps = {
  challengeToken: string;
  methods: MfaMethod[];
  // the step-1 "remember me" choice; the verify request creates the session,
  // so the cookie lifetime decision rides on it
  remember?: boolean;
  onCancel: () => void;
};

const getDefaultPluginMultiFactorAuth = () => ({
  isEnabled: () => false,
  ChallengeForm: PluginPlaceholder<MfaChallengeFormProps>,
  // Routed at /account/security, so direct navigation in OSS should 404
  // rather than render a blank page.
  AccountSecurityPanel: NotFoundPlaceholder,
  AdminAuthCard: PluginPlaceholder,
});

export const PLUGIN_MULTI_FACTOR_AUTH = getDefaultPluginMultiFactorAuth();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_MULTI_FACTOR_AUTH, getDefaultPluginMultiFactorAuth());
}
