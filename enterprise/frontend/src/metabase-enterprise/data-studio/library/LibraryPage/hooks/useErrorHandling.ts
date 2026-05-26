import { useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";

import { getErrorMessage } from "metabase/api/utils";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { useMetadataToasts } from "metabase/metadata/hooks";

export const useErrorHandling = (_error: unknown) => {
  const error = useDebouncedValue(_error, 1000);
  const { sendErrorToast } = useMetadataToasts();

  useEffect(() => {
    if (_.isObject(error)) {
      const extractedMessage = getErrorMessage(error, t`Server error`);
      sendErrorToast(t`Data couldn't be fetched properly: ${extractedMessage}`);
    }
  }, [error, sendErrorToast]);
};
