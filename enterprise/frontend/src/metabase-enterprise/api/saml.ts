import { invalidateTags, tag } from "metabase/api/tags";
import type { EnterpriseSettings } from "metabase-types/api";

import { EnterpriseApi } from "./api";

type SAMLSettings = Pick<
  EnterpriseSettings,
  | "saml-enabled"
  | "saml-user-provisioning-enabled?"
  | "saml-attribute-email"
  | "saml-attribute-firstname"
  | "saml-attribute-lastname"
  | "saml-identity-provider-uri"
  | "saml-identity-provider-issuer"
  | "saml-identity-provider-certificate"
  | "saml-application-name"
  | "saml-keystore-password"
  | "saml-keystore-alias"
  | "saml-keystore-path"
  | "saml-attribute-group"
  | "saml-group-sync"
>;

export const samlApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    updateSaml: builder.mutation<boolean, Partial<SAMLSettings>>({
      query: (settings) => ({
        method: "PUT",
        url: `/api/saml/settings`,
        body: settings,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
  }),
});

export const { useUpdateSamlMutation } = samlApi;
