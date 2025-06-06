import path from "path";

import { IS_DEV_MODE } from "./is-dev-mode.mjs";
import {
  ASSETS_PATH,
  CLJS_SRC_PATH,
  CLJS_SRC_PATH_DEV,
  E2E_PATH,
  ENTERPRISE_SRC_PATH,
  FONTS_PATH,
  LIB_SRC_PATH,
  ROOT_CSS_FILE_PATH,
  SDK_SRC_PATH,
  SRC_PATH,
  TEST_SUPPORT_PATH,
  TYPES_SRC_PATH,
} from "./paths.mjs";

export const ALIAS = {
  assets: ASSETS_PATH,
  "~assets": ASSETS_PATH,
  fonts: FONTS_PATH,
  metabase: SRC_PATH,
  "metabase-lib": LIB_SRC_PATH,
  "metabase-enterprise": ENTERPRISE_SRC_PATH,
  "metabase-types": TYPES_SRC_PATH,
  "metabase-dev": path.join(SRC_PATH, `dev${IS_DEV_MODE ? "" : "-noop"}.js`),
  cljs: IS_DEV_MODE ? CLJS_SRC_PATH_DEV : CLJS_SRC_PATH,
  __support__: TEST_SUPPORT_PATH,
  e2e: E2E_PATH,
  style: ROOT_CSS_FILE_PATH,
  "sdk-ee-plugins": path.join(ENTERPRISE_SRC_PATH, "sdk-plugins"),
  "sdk-specific-imports": path.join(
    SDK_SRC_PATH,
    "/lib/sdk-specific-imports.ts",
  ),
  "ee-overrides": path.join(ENTERPRISE_SRC_PATH, "overrides"),
  "embedding-sdk": SDK_SRC_PATH,
};
