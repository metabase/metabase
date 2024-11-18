// @ts-expect-error window.Cypress is not typed
export const isCypressActive = !!window.Cypress;

export const isStorybookActive = !!process.env.STORYBOOK;

export const isProduction = process.env.WEBPACK_BUNDLE === "production";

export const isTest = process.env.NODE_ENV === "test";

export const shouldLogAnalytics = process.env.MB_LOG_ANALYTICS === "true";

export const isChartsDebugLoggingEnabled =
  process.env.MB_LOG_CHARTS_DEBUG === "true";

export const isEmbeddingSdk = !!process.env.IS_EMBEDDING_SDK;
