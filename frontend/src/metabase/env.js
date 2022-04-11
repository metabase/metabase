export const isCypressActive = !!window.Cypress;

// eslint-disable-next-line no-undef
export const isProduction = process.env.WEBPACK_BUNDLE === "production";
