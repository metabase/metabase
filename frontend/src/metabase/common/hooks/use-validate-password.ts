import { getIn } from "icepick";
import { useCallback } from "react";

import { useCheckPasswordMutation } from "metabase/api";
import { passwordComplexityDescription } from "metabase/utils/password";

export const useValidatePassword = () => {
  const [checkPassword] = useCheckPasswordMutation();

  return useCallback(
    async (password: string): Promise<string | undefined> => {
      const error = passwordComplexityDescription(password);
      if (error) {
        return error;
      }

      try {
        await checkPassword({ password }).unwrap();
      } catch (error) {
        return getIn(error, ["data", "errors", "password"]);
      }
    },
    [checkPassword],
  );
};
