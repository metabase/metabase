import { initializePlugins } from "sdk-ee-plugins";

// Plugins that are only applicable to the new iframe embedding.
import { initializePlugin as initializeEmbeddingIframeSdkPlugin } from "./embedding_iframe_sdk";
import { initializeHandleLinkPlugin } from "./embedding_iframe_sdk/handle-link";

// Sdk plugins
initializePlugins();

// EAJS specific plugins and overrides
initializeEmbeddingIframeSdkPlugin();
initializeHandleLinkPlugin();
