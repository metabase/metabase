import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import { registerTransformQueryHooks } from "metabase/transforms";

process.env.IS_EMBEDDING_SDK = "true";

EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

registerTransformQueryHooks();
