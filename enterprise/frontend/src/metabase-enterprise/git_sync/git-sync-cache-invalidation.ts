import type { TagDescription } from "@reduxjs/toolkit/query";

import type { EnterpriseTagType } from "../api/tags";
import { tag } from "../api/tags";

export function getGitSyncInvalidationTags(): TagDescription<EnterpriseTagType>[] {
  return [tag("collection-dirty-entities"), tag("collection-is-dirty")];
}
