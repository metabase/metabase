import { t } from "ttag";

import { hasActionsEnabled } from "metabase/common/utils/database";
import type { Database } from "metabase-types/api";

export function getRunDisabledReason(database: Database | undefined) {
  if (database == null) {
    return t`You don't have access to this action's database.`;
  }
  if (!hasActionsEnabled(database)) {
    return t`Actions are disabled for this action's database.`;
  }
  return undefined;
}
