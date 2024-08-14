import { t } from "ttag";

import type Question from "metabase-lib/v1/Question";
import type { CacheableDashboard, CacheableModel } from "metabase-types/api";

export const getItemId = (
  model: CacheableModel,
  item: CacheableDashboard | Question,
) =>
  model === "dashboard"
    ? (item as CacheableDashboard).id
    : (item as Question).id();

export const getItemName = (
  model: CacheableModel,
  item: CacheableDashboard | Question,
) =>
  model === "dashboard"
    ? (item as CacheableDashboard).name
    : (item as Question).displayName() ?? t`Untitled question`;
