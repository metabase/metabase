import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

// eslint-disable-next-line no-undef
process.env.IS_EMBEDDING_SDK = "true";

EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;
