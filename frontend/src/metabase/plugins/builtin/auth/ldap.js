import { t } from "ttag";
import { updateIn } from "icepick";

import {
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS,
} from "metabase/plugins";

import SettingsLdapForm from "metabase/admin/settings/components/SettingsLdapForm";
import AuthenticationOption from "metabase/admin/settings/components/widgets/AuthenticationOption";
import GroupMappingsWidget from "metabase/admin/settings/components/widgets/GroupMappingsWidget";

PLUGIN_ADMIN_SETTINGS_UPDATES.push(
  sections =>
    updateIn(sections, ["authentication", "settings"], settings => [
      ...settings,
      {
        authName: t`LDAP`,
        authDescription: t`Allows users within your LDAP directory to log in to Metabase with their LDAP credentials, and allows automatic mapping of LDAP groups to Metabase groups.`,
        authType: "ldap",
        authEnabled: settings => settings["ldap-enabled"],
        widget: AuthenticationOption,
      },
    ]),
  sections => ({
    ...sections,
    "authentication/ldap": {
      sidebar: false,
      component: SettingsLdapForm,
      settings: [
        {
          key: "ldap-enabled",
          display_name: t`LDAP Authentication`,
          description: null,
          type: "boolean",
        },
        {
          key: "ldap-host",
          display_name: t`LDAP Host`,
          placeholder: "ldap.yourdomain.org",
          type: "string",
          required: true,
          autoFocus: true,
        },
        {
          key: "ldap-port",
          display_name: t`LDAP Port`,
          placeholder: "389",
          type: "string",
          validations: [["integer", t`That's not a valid port number`]],
        },
        {
          key: "ldap-security",
          display_name: t`LDAP Security`,
          description: null,
          type: "radio",
          options: { none: "None", ssl: "SSL", starttls: "StartTLS" },
          defaultValue: "none",
        },
        {
          key: "ldap-bind-dn",
          display_name: t`Username or DN`,
          type: "string",
        },
        {
          key: "ldap-password",
          display_name: t`Password`,
          type: "password",
        },
        {
          key: "ldap-user-base",
          display_name: t`User search base`,
          type: "string",
          required: true,
        },
        {
          key: "ldap-user-filter",
          display_name: t`User filter`,
          type: "string",
          validations: [
            value =>
              (value.match(/\(/g) || []).length !==
              (value.match(/\)/g) || []).length
                ? t`Check your parentheses`
                : null,
          ],
        },
        {
          key: "ldap-attribute-email",
          display_name: t`Email attribute`,
          type: "string",
        },
        {
          key: "ldap-attribute-firstname",
          display_name: t`First name attribute`,
          type: "string",
        },
        {
          key: "ldap-attribute-lastname",
          display_name: t`Last name attribute`,
          type: "string",
        },
        {
          key: "ldap-group-sync",
          display_name: t`Synchronize group memberships`,
          description: null,
          widget: GroupMappingsWidget,
          props: {
            mappingSetting: "ldap-group-mappings",
            groupHeading: t`Distinguished Name`,
            groupPlaceholder: "cn=People,ou=Groups,dc=metabase,dc=com",
          },
        },
        {
          key: "ldap-group-base",
          display_name: t`Group search base`,
          type: "string",
        },
        {
          key: "ldap-group-mappings",
        },
      ],
    },
  }),
);

PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS.push(user => !user.ldap_auth);
