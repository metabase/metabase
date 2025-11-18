import {
  NotFoundPlaceholder,
  PluginPlaceholder,
} from "metabase/plugins/components/PluginPlaceholder";
import type { User } from "metabase-types/api";

import type { GetAuthProviders } from "../types";

export const PLUGIN_AUTH_PROVIDERS = {
  isEnabled: () => false,
  AuthSettingsPage: PluginPlaceholder,
  UserProvisioningSettings: NotFoundPlaceholder,
  SettingsSAMLForm: NotFoundPlaceholder,
  SettingsJWTForm: NotFoundPlaceholder,
  providers: [] as GetAuthProviders[],
};

export const PLUGIN_LDAP_FORM_FIELDS = {
  LdapUserProvisioning: PluginPlaceholder,
  LdapGroupMembershipFilter: PluginPlaceholder,
};

export const PLUGIN_IS_PASSWORD_USER: ((user: User) => boolean)[] = [];

export const PLUGIN_ADMIN_USER_FORM_FIELDS = {
  FormLoginAttributes: PluginPlaceholder,
};
