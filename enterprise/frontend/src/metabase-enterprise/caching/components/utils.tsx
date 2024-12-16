import { match } from "ts-pattern";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
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
    : ((item as Question).displayName() ?? t`Untitled question`);

export const getItemUrl = (
  model: CacheableModel,
  item: { id: number; name: string },
) =>
  match(model)
    .with("dashboard", () => Urls.dashboard(item))
    .with("question", () => Urls.question(item))
    .otherwise(() => null);
