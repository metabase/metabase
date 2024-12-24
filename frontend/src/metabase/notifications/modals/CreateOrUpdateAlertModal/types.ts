import type { Alert } from "metabase-types/api";

export interface CreateAlertFormValues
  extends Pick<
    Alert,
    | "alert_above_goal"
    | "alert_condition"
    | "alert_first_only"
    | "card"
    | "channels"
  > {}
