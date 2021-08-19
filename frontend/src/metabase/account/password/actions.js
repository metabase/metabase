import { t } from "ttag";
import { UserApi, UtilApi } from "metabase/services";
import { createThunkAction } from "metabase/lib/redux";

export const UPDATE_PASSWORD = "UPDATE_PASSWORD";
export const VALIDATE_PASSWORD = "VALIDATE_PASSWORD";

export const validatePassword = createThunkAction(VALIDATE_PASSWORD, function(
  password,
) {
  return async function() {
    return await UtilApi.password_check({
      password: password,
    });
  };
});

export const updatePassword = createThunkAction(UPDATE_PASSWORD, function(
  user_id,
  password,
  old_password,
) {
  return async function() {
    try {
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
    } catch (error) {
      return error;
    }
  };
});
