// eslint-disable-next-line no-undef
const webpackBundle = process.env.WEBPACK_BUNDLE || "development";

export const IS_DEV_MODE = webpackBundle !== "production";
