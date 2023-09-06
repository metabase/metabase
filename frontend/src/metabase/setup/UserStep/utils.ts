import { getIn } from "icepick";
import { UtilApi } from "metabase/services";
import MetabaseSettings from "metabase/lib/settings";

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
