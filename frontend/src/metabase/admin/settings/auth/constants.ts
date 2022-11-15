import * as Yup from "yup";

export const GOOGLE_SCHEMA = Yup.object({
  "google-auth-enabled": Yup.boolean().default(false),
  "google-auth-client-id": Yup.string().nullable().default(null),
  "google-auth-auto-create-accounts-domain": Yup.string()
    .nullable()
    .default(null),
});

export const LDAP_SCHEMA = Yup.object({
  "ldap-enabled": Yup.boolean().default(false),
  "ldap-host": Yup.string().nullable().default(null),
  "ldap-port": Yup.number().nullable().default(null),
  "ldap-security": Yup.string().default("none"),
  "ldap-bind-dn": Yup.string().nullable().default(null),
  "ldap-password": Yup.string().nullable().default(null),
  "ldap-user-base": Yup.string().nullable().default(null),
  "ldap-user-filter": Yup.string().nullable().default(null),
  "ldap-attribute-email": Yup.string().nullable().default(null),
  "ldap-attribute-firstname": Yup.string().nullable().default(null),
  "ldap-attribute-lastname": Yup.string().nullable().default(null),
  "ldap-group-sync": Yup.boolean().default(false),
  "ldap-group-base": Yup.string().nullable().default(null),
  "ldap-group-mappings": Yup.object().default(null),
});
