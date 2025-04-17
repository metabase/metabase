export const IMAGE_NAME = "metabase/metabase-enterprise:latest";
export const CONTAINER_NAME = "metabase-enterprise-embedding";
export const SITE_NAME = "Metabase Embedding SDK Demo";
export const SDK_PACKAGE_NAME = "@metabase/embedding-sdk-react";
export const SDK_DOCS_LINK = "https://metaba.se/sdk";
export const SAMPLE_CREDENTIALS_FILE_NAME = "METABASE_LOGIN.json";

/**
 * Default port for the local Metabase instance.
 * Make sure this port is unlikely to be in use.
 */
export const DEFAULT_PORT = 3366;

/**
 * Hard-coded JWT shared secret for the hard-coded Express.js demo.
 */
export const HARDCODED_JWT_SHARED_SECRET =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

// Name of the permission groups and collections to create.
export const SANDBOXED_GROUP_NAMES = ["Customer A", "Customer B", "Customer C"];

// Tables from the sample database that are selected by default.
export const SAMPLE_DATABASE_SELECTED_TABLES = ["PEOPLE", "ORDERS", "PRODUCTS"];

// The path to the directory where the generated components will be placed.
export const GENERATED_COMPONENTS_DEFAULT_PATH = "components/metabase";

// The demo route to be created in Next.js' router directory (e.g. pages or app)
export const NEXTJS_DEMO_ROUTE_NAME = "analytics-demo";
