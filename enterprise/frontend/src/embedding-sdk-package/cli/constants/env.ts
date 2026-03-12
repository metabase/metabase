import { SITE_NAME } from "./config";

/**
 * Use the same setup token for every demo instance.
 * This makes it easy to configure across runs.
 */
export const EMBEDDING_DEMO_SETUP_TOKEN =
  "2a29948a-ed75-490e-9391-a22690fa5a76";

export const METABASE_INSTANCE_DEFAULT_ENVS: Record<string, string> = {
  MB_SITE_NAME: SITE_NAME,
  MB_EMBEDDING_APP_ORIGIN: "http://localhost:*",
  MB_ENABLE_EMBEDDING: "true",
  MB_EMBEDDING_HOMEPAGE: "visible",
  MB_SETUP_TOKEN: EMBEDDING_DEMO_SETUP_TOKEN,
};
