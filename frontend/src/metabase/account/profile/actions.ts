import { userApi } from "metabase/api";
import { createThunkAction } from "metabase/lib/redux";

import type { MetabaseUsersApiUser } from "../../../../../ts-types/hey-api/types.gen";

import type { UserProfileData } from "./types";

export const UPDATE_USER = "metabase/account/profile/UPDATE_USER";
export const updateUser = createThunkAction(
  UPDATE_USER,
  (user: MetabaseUsersApiUser, data: UserProfileData) =>
    async (dispatch: any) => {
      await dispatch(
        userApi.endpoints.updateUser.initiate({ ...data, id: user.id }),
      ).unwrap();

      if (user.locale !== data.locale) {
        window.location.reload();
      }
    },
);
