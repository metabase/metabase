export const assistant_url = "wss://dev.chat.omniloy.com";
export const isCypressActive = !!window.Cypress;

// eslint-disable-next-line no-undef
export const isStorybookActive = !!process.env.STORYBOOK;

// eslint-disable-next-line no-undef
export const isProduction = process.env.WEBPACK_BUNDLE === "production";

// eslint-disable-next-line no-undef
export const isTest = process.env.NODE_ENV === "test";

// eslint-disable-next-line no-undef
export const shouldLogAnalytics = process.env.MB_LOG_ANALYTICS === "true";

export const isChartsDebugLoggingEnabled =
  // eslint-disable-next-line no-undef
  process.env.MB_LOG_CHARTS_DEBUG === "true";

// eslint-disable-next-line no-undef
export const isEmbeddingSdk = !!process.env.IS_EMBEDDING_SDK_BUILD;
