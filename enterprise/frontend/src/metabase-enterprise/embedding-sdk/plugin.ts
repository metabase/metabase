import type { EmbeddingSdkPlugin } from "metabase/embedding/sdk/types";
import type { OnBeforeRequestHandler } from "metabase/plugins/oss/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";

const noopRequestHandler: OnBeforeRequestHandler = async () => {};

/**
 * Enterprise embedding-SDK plugin. Bundled in EE builds in place of the OSS
 * default. `isEnabled` is gated on the embedding_sdk token feature;
 * `onBeforeRequestHandlers` is the runtime-mutable holder that SDK auth and
 * guest-embed init write into and the API middleware reads.
 */
export const PLUGIN_EMBEDDING_SDK: EmbeddingSdkPlugin = {
  isEnabled: () => hasPremiumFeature("embedding_sdk") ?? false,
  onBeforeRequestHandlers: {
    getOrRefreshSessionHandler: noopRequestHandler,
    getOrRefreshGuestSessionHandler: noopRequestHandler,
    overrideRequestsForGuestEmbeds: noopRequestHandler,
  },
};
