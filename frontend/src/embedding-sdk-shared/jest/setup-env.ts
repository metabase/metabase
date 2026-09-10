import { enterSdkMode } from "metabase/embedding-sdk/lib/enter-sdk-mode";

process.env.IS_EMBEDDING_SDK = "true";

enterSdkMode();
