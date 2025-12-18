import { createSelector } from "@reduxjs/toolkit";

import { getTokenStatus } from "metabase/selectors/settings";
import { getUser } from "metabase/selectors/user";

export const getStoreUsers = createSelector(
  getUser,
  getTokenStatus,
  (
    currentUser,
    tokenStatus,
  ): { isStoreUser: boolean; anyStoreUserEmailAddress?: string } => {
    const storeUserEmails =
      tokenStatus?.["store-users"]?.map(({ email }) => email.toLowerCase()) ??
      [];
    return {
      isStoreUser:
        !!currentUser &&
        storeUserEmails.includes(currentUser.email.toLowerCase()),
      anyStoreUserEmailAddress:
        storeUserEmails.length > 0 ? storeUserEmails[0] : undefined,
    };
  },
);
