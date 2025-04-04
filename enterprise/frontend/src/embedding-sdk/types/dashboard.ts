import type { DashboardId } from "metabase-types/api";

import type { SdkEntityId } from "./entity-id";

export type SdkDashboardId = DashboardId | SdkEntityId;
