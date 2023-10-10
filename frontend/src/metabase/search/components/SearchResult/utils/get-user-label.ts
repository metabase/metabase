import { t } from "ttag";
import type { WrappedResult } from "metabase/search/types";

export const getUserLabel = (result: WrappedResult) => {
  if (result.last_editor_common_name) {
    return t`Last edited by ${result.last_editor_common_name}`;
  }

  if (result.creator_common_name) {
    return t`Created by ${result.creator_common_name}`;
  }

  return null;
};
