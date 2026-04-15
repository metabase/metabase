import { trackSchemaEvent } from "metabase/utils/analytics";
import type { EmbeddedAnalyticsJsEventSchema } from "metabase-types/analytics/embedded-analytics-js";

export const trackEmbeddedAnalyticsJs = (
  usage: EmbeddedAnalyticsJsEventSchema,
) => trackSchemaEvent("embedded_analytics_js", usage);
