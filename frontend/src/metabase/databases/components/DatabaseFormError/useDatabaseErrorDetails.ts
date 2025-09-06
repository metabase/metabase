import { useFormikContext } from "formik";
import { t } from "ttag";

import { useFormErrorMessage } from "metabase/forms";
import type { DatabaseData } from "metabase-types/api";

export const useDatabaseErrorDetails = () => {
  const { errors } = useFormikContext<DatabaseData>();
  const originalErrorMessage = useFormErrorMessage();
  const isHostAndPortError =
    typeof errors?.details === "object" &&
    !!(errors?.details?.["host"] || errors?.details?.["port"]);
  const errorMessage = isHostAndPortError
    ? getHostAndPortSpecificErrorMessage()
    : originalErrorMessage;

  return {
    errorMessage,
    isHostAndPortError,
  };
};

export const getHostAndPortSpecificErrorMessage = () => {
  return t`Make sure your Host and Port settings are correct.`;
};
