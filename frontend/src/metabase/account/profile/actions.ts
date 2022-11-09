import { createThunkAction } from "metabase/lib/redux";
import Users from "metabase/entities/users";
import { User } from "metabase-types/api";
import { Dispatch } from "metabase-types/store";
import { UserProfileData } from "./types";

export const UPDATE_USER = "metabase/account/profile/UPDATE_USER";
export const updateUser = createThunkAction(
  UPDATE_USER,
  (user: User, values: UserProfileData) => async (dispatch: Dispatch) => {
    await dispatch(Users.actions.update(values));

    if (user.locale !== values.locale) {
      window.location.reload();
    }
  },
);
