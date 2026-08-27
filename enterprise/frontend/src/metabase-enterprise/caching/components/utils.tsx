import { t } from "ttag";

import type Question from "metabase-lib/v1/Question";
import type { CacheableDashboard, CacheableModel } from "metabase-types/api";

export const getItemId = (
  model: CacheableModel,
  item: CacheableDashboard | Question,
) =>
  model === "dashboard"
    ? // Unjustified type cast. FIXME
      (item as CacheableDashboard).id
    : // Unjustified type cast. FIXME
      (item as Question).id();

export const getItemName = (
  model: CacheableModel,
  item: CacheableDashboard | Question,
) =>
  model === "dashboard"
    ? // Unjustified type cast. FIXME
      (item as CacheableDashboard).name
    : // Unjustified type cast. FIXME
      ((item as Question).displayName() ?? t`Untitled question`);
