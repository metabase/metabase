import { initializeResourceDownloadsPlugin } from "./resource_downloads_plugin";

/**
 * Initialize resource downloads plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  initializeResourceDownloadsPlugin();
}
