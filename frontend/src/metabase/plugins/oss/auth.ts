import type { ComponentType } from "react";

import {
  PluginPlaceholder,
  pluginPlaceholderRoute,
} from "metabase/plugins/components/PluginPlaceholder";
import type { User, UserId } from "metabase-types/api";

import { definePluginSlot } from "../slot";
import type { GetAuthProviders } from "../types";

export type AuthSettingsPageTab =
  | "authentication"
  | "user-provisioning"
  | "api-keys";

export type AuthSettingsPageProps = {
  tab?: AuthSettingsPageTab;
};

const getDefaultPluginAuthProviders = () => ({
  isEnabled: () => false,
  AuthSettingsPage: PluginPlaceholder<AuthSettingsPageProps>,
  UserProvisioningSettings: PluginPlaceholder,
  settingsSAMLForm: pluginPlaceholderRoute,
  settingsJWTForm: pluginPlaceholderRoute,
  settingsOIDCForm: pluginPlaceholderRoute,
  // Unjustified type cast. FIXME
  providers: [] as GetAuthProviders[],
});

export const PLUGIN_AUTH_PROVIDERS = definePluginSlot(
  getDefaultPluginAuthProviders,
);

const getDefaultPluginLdapFormFields = () => ({
  LdapUserProvisioning: PluginPlaceholder,
  LdapGroupMembershipFilter: PluginPlaceholder,
});

export const PLUGIN_LDAP_FORM_FIELDS = definePluginSlot(
  getDefaultPluginLdapFormFields,
);

const getDefaultPluginIsPasswordUser = (): ((user: User) => boolean)[] => [];

export const PLUGIN_IS_PASSWORD_USER = definePluginSlot(
  getDefaultPluginIsPasswordUser,
);

const getDefaultPluginAdminUserFormFields = (): {
  FormLoginAttributes: ComponentType<{ userId?: UserId | null }>;
} => ({
  FormLoginAttributes: PluginPlaceholder,
});

export const PLUGIN_ADMIN_USER_FORM_FIELDS = definePluginSlot(
  getDefaultPluginAdminUserFormFields,
);
