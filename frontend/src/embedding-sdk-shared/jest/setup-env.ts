import { setIsEmbeddingSdk } from "metabase/embedding-sdk/lib/set-is-embedding-sdk";

process.env.IS_EMBEDDING_SDK = "true";

setIsEmbeddingSdk();
