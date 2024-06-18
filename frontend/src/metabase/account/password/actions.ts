import { getIn } from "icepick";

import MetabaseSettings from "metabase/lib/settings";
import { UtilApi } from "metabase/services";

export const validatePassword = async (password: string) => {
  const error = MetabaseSettings.passwordComplexityDescription(password);
  if (error) {
    return error;
  }

  try {
    await UtilApi.password_check({ password });
  } catch (error) {
    return getIn(error, ["data", "errors", "password"]);
  }
};
