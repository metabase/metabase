import Users from "metabase/entities/users";
import { createThunkAction } from "metabase/lib/redux";
import type { User } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import type { UserProfileData } from "./types";

export const UPDATE_USER = "metabase/account/profile/UPDATE_USER";
export const updateUser = createThunkAction(
  UPDATE_USER,
  (user: User, data: UserProfileData) => async (dispatch: Dispatch) => {
    await dispatch(Users.actions.update({ ...data, id: user.id }));

    if (user.locale !== data.locale) {
      window.location.reload();
    }
  },
);
