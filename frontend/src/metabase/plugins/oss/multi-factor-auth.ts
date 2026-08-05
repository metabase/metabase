import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { MfaMethod } from "metabase-types/api";

export type AuthChallengeFormProps = {
  challengeToken: string;
  methods: MfaMethod[];
  remember?: boolean;
  onCancel: () => void;
};

/**
 * No `methods`: the gate hard-codes `["totp"]` on the enrollment branch (no email fallback while
 * enrolling), so there is nothing for the UI to branch on.
 */
export type AuthEnrollmentFormProps = {
  enrollmentToken: string;
  secret: string;
  otpauthUri: string;
  remember?: boolean;
  onCancel: () => void;
};

const getDefaultPluginMultiFactorAuth = () => ({
  AuthChallengeForm: PluginPlaceholder<AuthChallengeFormProps>,
  AuthEnrollmentForm: PluginPlaceholder<AuthEnrollmentFormProps>,
  AccountSecurityPanel: PluginPlaceholder,
  AdminAuthCard: PluginPlaceholder,
  EnrolledUsersPage: PluginPlaceholder,
  UnenrolledUsersPage: PluginPlaceholder,
});

export const PLUGIN_MULTI_FACTOR_AUTH = getDefaultPluginMultiFactorAuth();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_MULTI_FACTOR_AUTH, getDefaultPluginMultiFactorAuth());
}
