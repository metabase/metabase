import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import type { DashboardCard } from "metabase-types/api";

export const getDashcardTokenId = (dashcard: DashboardCard) =>
  isJWT(dashcard.dashboard_id) ? String(dashcard.dashboard_id) : undefined;

export const getDashcardUuid = (dashcard: DashboardCard) =>
  isUuid(dashcard.dashboard_id) ? String(dashcard.dashboard_id) : undefined;
