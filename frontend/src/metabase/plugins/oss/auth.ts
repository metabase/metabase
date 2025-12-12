import {
  NotFoundPlaceholder,
  PluginPlaceholder,
} from "metabase/plugins/components/PluginPlaceholder";
import type { User } from "metabase-types/api";

import type { GetAuthProviders } from "../types";

const getDefaultPluginAuthProviders = () => ({
  isEnabled: () => false,
  AuthSettingsPage: PluginPlaceholder,
  UserProvisioningSettings: NotFoundPlaceholder,
  SettingsSAMLForm: NotFoundPlaceholder,
  SettingsJWTForm: NotFoundPlaceholder,
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

const getDefaultPluginAdminUserFormFields = () => ({
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
