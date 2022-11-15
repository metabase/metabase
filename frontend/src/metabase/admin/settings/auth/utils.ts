import * as Yup from "yup";

export const GOOGLE_SCHEMA = Yup.object({
  "google-auth-enabled": Yup.boolean().default(false),
  "google-auth-client-id": Yup.string().nullable().default(null),
  "google-auth-auto-create-accounts-domain": Yup.string()
    .nullable()
    .default(null),
});
