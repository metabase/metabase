import type { EmbeddedAnalyticsJsEventSchema } from "metabase-types/analytics/embedded-analytics-js";
import { trackSchemaEvent } from "metabase/analytics";

export const trackEmbeddedAnalyticsJs = (
  usage: EmbeddedAnalyticsJsEventSchema,
) => trackSchemaEvent("embedded_analytics_js", usage);
