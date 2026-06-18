/* eslint-disable import/order */

// Must run before any dynamic import(): sets webpack's runtime publicPath so
// on-demand chunks load from the Metabase-hosted SDK asset directory.
import "./lib/sdk-public-path";

import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

// Enable SDK mode as we are in the SDK bundle
// This applies to SDK derivatives such as new iframe embedding.
EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

// Import the embedding SDK vendors side-effects
import "metabase/embedding-sdk/vendors-side-effects";

// Import the EE plugins required by the embedding sdk.
import { initializePlugins } from "sdk-ee-plugins";

initializePlugins();

// Imports which are only applicable to the embedding sdk, and not the new iframe embedding.
import "sdk-specific-imports";

import { sdkBundleExports } from "./sdk-bundle-exports";

import { defineBuildInfo } from "metabase/embedding-sdk/lib/define-build-info";

defineBuildInfo("METABASE_EMBEDDING_SDK_BUNDLE_BUILD_INFO");

// Define a global export METABASE_EMBEDDING_SDK_BUNDLE for SDK package
window.METABASE_EMBEDDING_SDK_BUNDLE = sdkBundleExports;

// Signal that the bundle is ready. In the bootstrap flow (chunked loading),
// rspack defers entry execution until all chunks are registered, so this event
// fires only after everything is ready.
document.dispatchEvent(new CustomEvent("metabase-sdk-bundle-loaded"));
