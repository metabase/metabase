import * as Yup from "yup";

export const JWT_SCHEMA = Yup.object({
  "jwt-enabled": Yup.boolean().default(false),
  "jwt-identity-provider-uri": Yup.string().nullable().default(null),
  "jwt-shared-secret": Yup.string().nullable().default(null),
  "jwt-attribute-email": Yup.string().nullable().default(null),
  "jwt-attribute-firstname": Yup.string().nullable().default(null),
  "jwt-attribute-lastname": Yup.string().nullable().default(null),
  "jwt-group-sync": Yup.boolean().default(false),
  "jwt-group-mappings": Yup.object().default(null),
});
