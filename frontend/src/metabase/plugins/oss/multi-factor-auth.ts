import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

export type MfaChallengeFormProps = {
  mfaToken: string;
  method: string;
  methods?: string[];
};

const getDefaultPluginMultiFactorAuth = () => ({
  isEnabled: () => false,
  ChallengeForm: PluginPlaceholder<MfaChallengeFormProps>,
  AccountSecurityPanel: PluginPlaceholder,
});

export const PLUGIN_MULTI_FACTOR_AUTH = getDefaultPluginMultiFactorAuth();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_MULTI_FACTOR_AUTH, getDefaultPluginMultiFactorAuth());
}
