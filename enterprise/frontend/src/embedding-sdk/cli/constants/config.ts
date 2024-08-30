export const IMAGE_NAME = "metabase/metabase-enterprise:latest";
export const CONTAINER_NAME = "metabase-enterprise-embedding";
export const SITE_NAME = "Metabase Embedding SDK Demo";
export const SDK_PACKAGE_NAME = "@metabase/embedding-sdk-react";

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

/**
 * The "customer_id" user attribute for tenant isolation.
 * This is used for sandboxing.
 **/
export const USER_ATTRIBUTE_CUSTOMER_ID = "customer_id";

// Name of the permission groups and collections to create.
export const SANDBOXED_GROUP_NAMES = ["Customer A", "Customer B", "Customer C"];
