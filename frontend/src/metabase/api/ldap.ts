import type { EnterpriseSettings } from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, tag } from "./tags";

type LdapSettings = Pick<
  EnterpriseSettings,
  | "ldap-enabled"
  | "ldap-host"
  | "ldap-port"
  | "ldap-security"
  | "ldap-bind-dn"
  | "ldap-password"
  | "ldap-user-base"
  | "ldap-user-filter"
  | "ldap-attribute-email"
  | "ldap-attribute-firstname"
  | "ldap-attribute-lastname"
  | "ldap-group-base"
  | "ldap-group-membership-filter"
>;

export const ldapApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    updateLdap: builder.mutation<boolean, Partial<LdapSettings>>({
      query: (settings) => ({
        method: "PUT",
        url: `/api/ldap/settings`,
        body: settings,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
  }),
});

export const { useUpdateLdapMutation } = ldapApi;
