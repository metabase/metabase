import { useMemo } from "react";

import { isInternalUser } from "metabase/urls";
import type { BaseUser } from "metabase-types/api";

import { useTenantUrls } from "./TenantUrlsProvider";

/**
 * The people URLs that branch on internal vs external users. The internal
 * branch is always admin; the external branch follows whichever host mounted
 * the tenant fragment, so the same row renders correct links in admin People
 * and in the embedding hub's Tenancy tab.
 */
export function useUserUrls() {
  const tenantUrls = useTenantUrls();

  return useMemo(
    () => ({
      newUser: () => "/admin/people/new",
      newTenantUser: () => tenantUrls.newUser(),

      editUser: (user: Pick<BaseUser, "id" | "tenant_id">) =>
        isInternalUser(user)
          ? `/admin/people/${user.id}/edit`
          : tenantUrls.editUser(user.id),

      resetPassword: (user: Pick<BaseUser, "id" | "tenant_id">) =>
        isInternalUser(user)
          ? `/admin/people/${user.id}/reset`
          : tenantUrls.resetUserPassword(user.id),

      newUserSuccess: (user: Pick<BaseUser, "id" | "tenant_id">) =>
        isInternalUser(user)
          ? `/admin/people/${user.id}/success`
          : tenantUrls.newUserSuccess(user.id),

      deactivateUser: (user: Pick<BaseUser, "id" | "tenant_id">) =>
        isInternalUser(user)
          ? `/admin/people/${user.id}/deactivate`
          : tenantUrls.deactivateUser(user.id),

      reactivateUser: (user: Pick<BaseUser, "id" | "tenant_id">) =>
        isInternalUser(user)
          ? `/admin/people/${user.id}/reactivate`
          : tenantUrls.reactivateUser(user.id),
    }),
    [tenantUrls],
  );
}
