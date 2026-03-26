import { getIn } from "icepick";

import { UtilApi } from "metabase/services";
import { passwordComplexityDescription } from "metabase/utils/password";

export const validatePassword = async (password: string) => {
  const error = passwordComplexityDescription(password);
  if (error) {
    return error;
  }

  try {
    await UtilApi.password_check({ password });
  } catch (error) {
    return getIn(error, ["data", "errors", "password"]);
  }
};
