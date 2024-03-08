import { getIn } from "icepick";

import MetabaseSettings from "metabase/lib/settings";
import { UserApi, UtilApi } from "metabase/services";
import type { User } from "metabase-types/api";

import type { UserPasswordData } from "./types";

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

export const updatePassword = async (user: User, data: UserPasswordData) => {
  await UserApi.update_password({
    id: user.id,
    password: data.password,
    old_password: data.old_password,
  });
};
