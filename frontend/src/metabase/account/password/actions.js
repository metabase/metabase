import { t } from "ttag";
import { UserApi, UtilApi } from "metabase/services";
import { createThunkAction } from "metabase/lib/redux";

export const UPDATE_PASSWORD = "UPDATE_PASSWORD";
export const VALIDATE_PASSWORD = "VALIDATE_PASSWORD";

export const validatePassword = createThunkAction(
  VALIDATE_PASSWORD,
  password => async () =>
    UtilApi.password_check({
      password,
    }),
);

export const updatePassword = createThunkAction(
  UPDATE_PASSWORD,
  (user_id, password, old_password) => async () => {
    await UserApi.update_password({
      id: user_id,
      password,
      old_password,
    });

    return {
      success: true,
      data: {
        message: t`Password updated successfully!`,
      },
    };
  },
);
