import * as Yup from "yup";

export const JWT_SCHEMA = Yup.object({
  "jwt-enabled": Yup.boolean().default(false),
  "jwt-user-provisioning-enabled?": Yup.boolean().default(null),
  "jwt-identity-provider-uri": Yup.string().nullable().default(null),
  "jwt-shared-secret": Yup.string().nullable().default(null),
  "jwt-attribute-email": Yup.string().nullable().default(null),
  "jwt-attribute-firstname": Yup.string().nullable().default(null),
  "jwt-attribute-lastname": Yup.string().nullable().default(null),
  "jwt-group-sync": Yup.boolean().default(false),
  "jwt-group-mappings": Yup.object().default(null),
});

export const SAML_SCHEMA = Yup.object({
  "saml-enabled": Yup.boolean().default(false),
  "saml-user-provisioning-enabled?": Yup.boolean().default(null),
  "saml-identity-provider-uri": Yup.string().nullable().default(null),
  "saml-identity-provider-issuer": Yup.string().nullable().default(null),
  "saml-identity-provider-certificate": Yup.string().nullable().default(null),
  "saml-application-name": Yup.string().nullable().default(null),
  "saml-keystore-path": Yup.string().nullable().default(null),
  "saml-keystore-password": Yup.string().nullable().default(null),
  "saml-keystore-alias": Yup.string().nullable().default(null),
  "saml-attribute-email": Yup.string().nullable().default(null),
  "saml-attribute-firstname": Yup.string().nullable().default(null),
  "saml-attribute-lastname": Yup.string().nullable().default(null),
  "saml-attribute-group": Yup.string().nullable().default(null),
  "saml-group-sync": Yup.boolean().default(false),
  "saml-group-mappings": Yup.object().default(null),
});
