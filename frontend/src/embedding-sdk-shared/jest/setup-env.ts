import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import { installSdkHostLinkHandler } from "metabase/embedding-sdk/install-host-link-handler";

process.env.IS_EMBEDDING_SDK = "true";

EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;
installSdkHostLinkHandler();
