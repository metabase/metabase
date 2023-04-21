/* eslint-env node */
const SENTRY_ENVIRONMENT =
  process.env.SENTRY_ENABLED === "true"
    ? {
        SENTRY_ENABLED: "false",
        SENTRY_DSN: "",
        MB_RELEASE: "",
        SENTRY_ENVIRONMENT: "dev",
        SENTRY_DEBUG_LOG_LEVEL_ENABLED: "false",
        SENTRY_TRACES_SAMPLE_RATE: "1.0",
      }
    : {};

module.exports = { SENTRY_ENVIRONMENT };
