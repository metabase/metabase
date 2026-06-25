import { api } from "metabase/api/client";

type InternalAnalyticsEvent = {
  op: "inc" | "dec" | "set" | "observe" | "clear";
  metric: string;
  labels?: Record<string, string> | null;
  amount?: number;
};

export async function postInternalAnalytics(
  events: InternalAnalyticsEvent[],
): Promise<void> {
  await api.request({
    method: "POST",
    url: "/api/analytics/internal",
    body: { events },
    retry: true,
  });
}
