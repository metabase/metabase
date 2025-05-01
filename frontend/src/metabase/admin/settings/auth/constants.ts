import { type AnySchema, boolean, number, object, string } from "yup";

import * as Errors from "metabase/lib/errors";
import { PLUGIN_LDAP_FORM_FIELDS } from "metabase/plugins";
import type { SettingDefinition } from "metabase-types/api";

const REQUIRED_SCHEMA = {
  is: (isEnabled: boolean, setting?: SettingDefinition) =>
    isEnabled && !setting?.is_env_setting,
  then: (schema: AnySchema) => schema.required(Errors.required),
};

export const GOOGLE_SCHEMA = object({
  "google-auth-enabled": boolean().nullable().default(false),
  "google-auth-client-id": string()
    .nullable()
    .default(null)
    .when(["google-auth-enabled", "$google-auth-client-id"], REQUIRED_SCHEMA),
  "google-auth-auto-create-accounts-domain": string().nullable().default(null),
});

export const LDAP_SCHEMA = object({
  ...PLUGIN_LDAP_FORM_FIELDS.formFieldsSchemas,
  "ldap-enabled": boolean().nullable().default(false),
  "ldap-host": string().nullable().default(null),
  "ldap-port": number().nullable().default(null),
  "ldap-security": string().nullable().default("none"),
  "ldap-bind-dn": string().nullable().default(null),
  "ldap-password": string().nullable().default(null),
  "ldap-user-base": string().nullable().default(null),
  "ldap-user-filter": string().nullable().default(null),
  "ldap-attribute-email": string().nullable().default(null),
  "ldap-attribute-firstname": string().nullable().default(null),
  "ldap-attribute-lastname": string().nullable().default(null),
  "ldap-group-sync": boolean().nullable().default(false),
  "ldap-group-base": string().nullable().default(null),
  "ldap-group-mappings": object().nullable().default(null),
});
