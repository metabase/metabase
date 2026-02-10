import { initializePlugins } from "sdk-ee-plugins";

// Plugins that are only applicable to the new iframe embedding.
import { initializePlugin as initializeEmbeddingIframeSdkPlugin } from "./embedding_iframe_sdk";

initializeEmbeddingIframeSdkPlugin();
initializePlugins();
