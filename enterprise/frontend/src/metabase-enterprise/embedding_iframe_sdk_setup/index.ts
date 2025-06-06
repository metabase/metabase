import { PLUGIN_EMBEDDING_IFRAME_SDK_SETUP } from "metabase/plugins";

import { SdkIframeEmbedSetup } from "./components/SdkIframeEmbedSetup";

PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.shouldShowEmbedInNewItemMenu = () => true;
PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.SdkIframeEmbedSetup = SdkIframeEmbedSetup;
