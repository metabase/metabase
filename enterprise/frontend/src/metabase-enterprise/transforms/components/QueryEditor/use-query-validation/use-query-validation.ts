import { useEffect } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import * as Lib from "metabase-lib";

import type { QueryValidationResult } from "../types";

export function useQueryValidation(query: Lib.Query) {
  const validationResult = getValidationResult(query);
  const { sendErrorToast } = useMetadataToasts();

  useEffect(() => {
    if (validationResult.message) {
      sendErrorToast(validationResult.message);
    }
  }, [validationResult.message, sendErrorToast]);

  return validationResult;
}

function getValidationResult(query: Lib.Query): QueryValidationResult {
  if (!Lib.canSave(query, "question")) {
    return { isValid: false };
  }

  const { isNative } = Lib.queryDisplayInfo(query);
  if (isNative) {
    const tags = Object.values(Lib.templateTags(query));
    if (tags.some((t) => t.type !== "card" && t.type !== "snippet")) {
      return {
        isValid: false,
        message: t`Variables in transforms aren't supported.`,
      };
    }
  }

  return { isValid: true };
}
