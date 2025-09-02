import { useFormikContext } from "formik";
import { t } from "ttag";

import { useFormErrorMessage } from "metabase/forms";
import type { DatabaseData } from "metabase-types/api";

export const useDatabaseErrorDetails = () => {
  const { errors } = useFormikContext<DatabaseData>();
  const originalErrorMessage = useFormErrorMessage();
  const isHostAndPortError =
    typeof errors?.details === "object" &&
    Object.hasOwn(errors?.details, "host") &&
    Object.hasOwn(errors?.details, "port");
  const errorMessage = isHostAndPortError
    ? t`Make sure your Host and Port settings are correct.`
    : originalErrorMessage;

  return {
    errorMessage,
    isHostAndPortError,
  };
};
