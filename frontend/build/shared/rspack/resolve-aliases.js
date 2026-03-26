// @ts-check
/* eslint-env node */

const path = require("path");

const { IS_DEV_MODE } = require("../constants");

const ROOT_PATH = path.resolve(__dirname, "../../../..");
const ASSETS_PATH = ROOT_PATH + "/resources/frontend_client/app/assets";
const FONTS_PATH = ROOT_PATH + "/resources/frontend_client/app/fonts";
const IMAGES_PATH = ROOT_PATH + "/resources/frontend_client/app/img";
const DOCS_PATH = ROOT_PATH + "/docs";
const FRONTEND_BUILD_CONFIGS_PATH = ROOT_PATH + "/frontend/build";
const SRC_PATH = ROOT_PATH + "/frontend/src/metabase";
const LIB_SRC_PATH = ROOT_PATH + "/frontend/src/metabase-lib";
const ENTERPRISE_SRC_PATH =
  ROOT_PATH + "/enterprise/frontend/src/metabase-enterprise";
const EMBEDDING_SRC_PATH = ROOT_PATH + "/enterprise/frontend/src/embedding";
const SDK_PACKAGE_SRC_PATH =
  ROOT_PATH + "/enterprise/frontend/src/embedding-sdk-package";
const SDK_BUNDLE_SRC_PATH = ROOT_PATH + "/frontend/src/embedding-sdk-bundle";
const SDK_SHARED_SRC_PATH = ROOT_PATH + "/frontend/src/embedding-sdk-shared";
const TYPES_SRC_PATH = ROOT_PATH + "/frontend/src/metabase-types";
const CLJS_SRC_PATH = ROOT_PATH + "/target/cljs_release";
const CLJS_SRC_PATH_DEV = ROOT_PATH + "/target/cljs_dev";
const TEST_SUPPORT_PATH = ROOT_PATH + "/frontend/test/__support__";
const E2E_PATH = ROOT_PATH + "/e2e";

const isDevMode = IS_DEV_MODE;

const resolveEnterprisePathOrNoop = (subpath) =>
  process.env.MB_EDITION === "ee"
    ? ENTERPRISE_SRC_PATH + subpath
    : SRC_PATH + "/lib/noop";

/**
 * Shared resolve aliases used by both rspack.main.config.js and
 * e2e/support/component-webpack.config.js
 */
const RESOLVE_ALIASES = {
  "build-configs": FRONTEND_BUILD_CONFIGS_PATH,
  assets: ASSETS_PATH,
  img: IMAGES_PATH,
  fonts: FONTS_PATH,
  docs: DOCS_PATH,
  metabase: SRC_PATH,
  "metabase-lib": LIB_SRC_PATH,
  "metabase-enterprise": ENTERPRISE_SRC_PATH,
  "metabase-types": TYPES_SRC_PATH,
  "metabase-dev": `${SRC_PATH}/dev${isDevMode ? "" : "-noop"}.ts`,
  cljs: isDevMode ? CLJS_SRC_PATH_DEV : CLJS_SRC_PATH,
  __support__: TEST_SUPPORT_PATH,
  e2e: E2E_PATH,
  style: SRC_PATH + "/css/core/index",
  // NOTE @kdoh - 7/24/18
  // icepick 2.x is es6 by default, to maintain backwards compatibility
  // with ie11 point to the minified version
  icepick: ROOT_PATH + "/node_modules/icepick/icepick.min",
  // conditionally load either the EE plugins file or a empty file in the CE code tree
  "ee-plugins":
    process.env.MB_EDITION === "ee"
      ? ENTERPRISE_SRC_PATH + "/plugins"
      : SRC_PATH + "/plugins/noop",
  "ee-overrides": resolveEnterprisePathOrNoop("/overrides"),
  embedding: EMBEDDING_SRC_PATH,
  "embedding-sdk-package": SDK_PACKAGE_SRC_PATH,
  "embedding-sdk-bundle": SDK_BUNDLE_SRC_PATH,
  "embedding-sdk-shared": SDK_SHARED_SRC_PATH,
  "sdk-iframe-embedding-ee-plugins": resolveEnterprisePathOrNoop(
    "/sdk-iframe-embedding-plugins",
  ),
  "sdk-iframe-embedding-script-ee-plugins": resolveEnterprisePathOrNoop(
    "/sdk-iframe-embedding-script-plugins",
  ),
  "sdk-ee-plugins":
    process.env.MB_EDITION === "ee"
      ? ENTERPRISE_SRC_PATH + "/sdk-plugins"
      : SRC_PATH + "/plugins/noop",
  "sdk-specific-imports": SRC_PATH + "/lib/noop",
};

module.exports = { RESOLVE_ALIASES };
