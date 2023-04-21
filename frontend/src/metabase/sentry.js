/* eslint-env node */
import * as Sentry from "@sentry/react";
import { BrowserTracing } from "@sentry/tracing";

if (process.env.SENTRY_ENABLED.toLowerCase() === "true") {
  Sentry.init({
    release: process.env.MB_RELEASE,
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
    debug: process.env.SENTRY_DEBUG_LOG_LEVEL_ENABLED.toLowerCase() === "true",
    // This enables automatic instrumentation
    integrations: [new BrowserTracing()],
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 1.0,
  });
}
