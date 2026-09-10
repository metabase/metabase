import {
  PluginPlaceholder,
  pluginPlaceholderRoute,
} from "metabase/plugins/components/PluginPlaceholder";
import type { MfaMethod } from "metabase-types/api";

import { definePluginSlot } from "../slot";

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
  enrolledUsersPage: pluginPlaceholderRoute,
  unenrolledUsersPage: pluginPlaceholderRoute,
});

export const PLUGIN_MULTI_FACTOR_AUTH = definePluginSlot(
  getDefaultPluginMultiFactorAuth,
);
