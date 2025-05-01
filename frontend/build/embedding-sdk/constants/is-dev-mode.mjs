// eslint-disable-next-line no-undef
const mode = process.env.MODE || "development";

export const MODE = mode;
export const IS_DEV_MODE = mode !== "production";
