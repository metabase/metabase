import { POST } from "metabase/lib/api";

type InternalAnalyticsEvent = {
  op: "inc" | "dec" | "set" | "observe" | "clear";
  metric: string;
  labels?: Record<string, string> | null;
  amount?: number;
};

const postEvents = POST("/api/analytics/internal");

export function postInternalAnalytics(
  events: InternalAnalyticsEvent[],
): Promise<void> {
  return postEvents({ events });
}
