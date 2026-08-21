import type { ComponentType, ReactNode } from "react";

import {
  PluginPlaceholder,
  pluginPlaceholderRoute,
} from "metabase/plugins/components/PluginPlaceholder";
import type { User, UserId } from "metabase-types/api";

import type { GetAuthProviders } from "../types";

export type AuthSettingsPageTab =
  | "authentication"
  | "user-provisioning"
  | "api-keys";

export type AuthSettingsPageProps = {
  tab?: AuthSettingsPageTab;
};

export type SettingsJWTFormProps = {
  /** `null` renders the form with no heading -- the embedding hub supplies its own. */
  title?: ReactNode;
};

const getDefaultPluginAuthProviders = () => ({
  isEnabled: () => false,
  AuthSettingsPage: PluginPlaceholder<AuthSettingsPageProps>,
  UserProvisioningSettings: PluginPlaceholder,
  settingsSAMLForm: pluginPlaceholderRoute,
  settingsJWTForm: pluginPlaceholderRoute,
  settingsOIDCForm: pluginPlaceholderRoute,
  SettingsJWTForm: PluginPlaceholder<SettingsJWTFormProps>,
  // Unjustified type cast. FIXME
  providers: [] as GetAuthProviders[],
});

export const PLUGIN_AUTH_PROVIDERS = getDefaultPluginAuthProviders();

const getDefaultPluginLdapFormFields = () => ({
  LdapUserProvisioning: PluginPlaceholder,
  LdapGroupMembershipFilter: PluginPlaceholder,
});

export const PLUGIN_LDAP_FORM_FIELDS = getDefaultPluginLdapFormFields();

const getDefaultPluginIsPasswordUser = (): ((user: User) => boolean)[] => [];

export const PLUGIN_IS_PASSWORD_USER = getDefaultPluginIsPasswordUser();

const getDefaultPluginAdminUserFormFields = (): {
  FormLoginAttributes: ComponentType<{ userId?: UserId | null }>;
} => ({
  FormLoginAttributes: PluginPlaceholder,
});

export const PLUGIN_ADMIN_USER_FORM_FIELDS =
  getDefaultPluginAdminUserFormFields();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_AUTH_PROVIDERS, getDefaultPluginAuthProviders());
  Object.assign(PLUGIN_LDAP_FORM_FIELDS, getDefaultPluginLdapFormFields());
  PLUGIN_IS_PASSWORD_USER.length = 0;
  PLUGIN_IS_PASSWORD_USER.push(...getDefaultPluginIsPasswordUser());
  Object.assign(
    PLUGIN_ADMIN_USER_FORM_FIELDS,
    getDefaultPluginAdminUserFormFields(),
  );
}
