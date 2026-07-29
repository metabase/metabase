import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { MfaMethod } from "metabase-types/api";

export type AuthChallengeFormProps = {
  challengeToken: string;
  methods: MfaMethod[];
  remember?: boolean;
  onCancel: () => void;
};

const getDefaultPluginMultiFactorAuth = () => ({
  AuthChallengeForm: PluginPlaceholder<AuthChallengeFormProps>,
  AccountSecurityPanel: PluginPlaceholder,
  AdminAuthCard: PluginPlaceholder,
});

export const PLUGIN_MULTI_FACTOR_AUTH = getDefaultPluginMultiFactorAuth();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_MULTI_FACTOR_AUTH, getDefaultPluginMultiFactorAuth());
}
