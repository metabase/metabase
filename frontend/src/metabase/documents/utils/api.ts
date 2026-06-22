import type { SkipToken } from "@reduxjs/toolkit/query";

import { skipToken } from "metabase/api";
import { isWithinIframe } from "metabase/utils/iframe";
import type { CommentTarget, ListCommentsRequest } from "metabase-types/api";

export function getListCommentsQuery(
  target: CommentTarget | null | undefined,
): ListCommentsRequest | SkipToken {
  if (!target || isWithinIframe()) {
    return skipToken;
  }

  return target;
}
