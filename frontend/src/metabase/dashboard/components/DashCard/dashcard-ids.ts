import type { DashboardCard } from "metabase-types/api";
import { isJWT } from "metabase/utils/jwt";
import { isUuid } from "metabase/utils/uuid";

export const getDashcardTokenId = (dashcard: DashboardCard) =>
  isJWT(dashcard.dashboard_id) ? String(dashcard.dashboard_id) : undefined;

export const getDashcardUuid = (dashcard: DashboardCard) =>
  isUuid(dashcard.dashboard_id) ? String(dashcard.dashboard_id) : undefined;
