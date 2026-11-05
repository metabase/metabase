import { useCallback } from "react";

import { useCheckPasswordMutation } from "metabase/api";
import { getByPath } from "metabase/utils/immutable";
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
        const message = getByPath(error, ["data", "errors", "password"]);
        return typeof message === "string" ? message : undefined;
      }
    },
    [checkPassword],
  );
};
