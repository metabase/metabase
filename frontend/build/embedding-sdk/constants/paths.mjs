import path from "path";

export const ROOT_PATH = path.resolve(import.meta.dirname, "../../../../");

export const SRC_PATH = path.resolve(ROOT_PATH, "frontend/src/metabase");

export const SDK_SRC_PATH = path.resolve(
  ROOT_PATH,
  "enterprise/frontend/src/embedding-sdk",
);

export const ENTERPRISE_SRC_PATH = path.resolve(
  ROOT_PATH,
  "enterprise/frontend/src/metabase-enterprise",
);

export const EMBEDDING_SRC_PATH = path.resolve(
  ROOT_PATH,
  "enterprise/frontend/src/embedding",
);

export const LIB_SRC_PATH = path.resolve(
  ROOT_PATH,
  "frontend/src/metabase-lib",
);

export const TYPES_SRC_PATH = path.resolve(
  ROOT_PATH,
  "frontend/src/metabase-types",
);

export const ROOT_CSS_FILE_PATH = path.join(SRC_PATH, "css/core/index");

export const CLJS_SRC_PATH_DEV = path.resolve(ROOT_PATH, "target/cljs_dev");

export const CLJS_SRC_PATH = path.resolve(ROOT_PATH, "target/cljs_release");

export const BUILD_PATH = path.resolve(
  ROOT_PATH,
  "resources/embedding-sdk/dist",
);

export const ASSETS_PATH = path.resolve(
  ROOT_PATH,
  "resources/frontend_client/app/assets",
);

export const FONTS_PATH = path.resolve(
  ROOT_PATH,
  "resources/frontend_client/app/fonts",
);

export const TEST_SUPPORT_PATH = path.resolve(
  ROOT_PATH,
  "frontend/test/__support__",
);

export const E2E_PATH = path.resolve(ROOT_PATH, "e2e");
