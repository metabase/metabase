import type { SkipToken } from "@reduxjs/toolkit/query";

import { skipToken } from "metabase/api";
import { isWithinIframe } from "metabase/lib/dom";
import type { Document, ListCommentsRequest } from "metabase-types/api";

export function getListCommentsQuery(
  document: Document | null | undefined,
): ListCommentsRequest | SkipToken {
  if (!document || isWithinIframe()) {
    return skipToken;
  }

  return {
    target_type: "document",
    target_id: document.id,
  };
}
