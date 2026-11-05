import { useEffect } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useMetadataToasts } from "metabase/common/hooks";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { isObject } from "metabase-types/guards";

export const useErrorHandling = (_error: unknown) => {
  const error = useDebouncedValue(_error, 1000);
  const { sendErrorToast } = useMetadataToasts();

  useEffect(() => {
    if (isObject(error)) {
      const extractedMessage = getErrorMessage(error, t`Server error`);
      sendErrorToast(t`Data couldn't be fetched properly: ${extractedMessage}`);
    }
  }, [error, sendErrorToast]);
};
