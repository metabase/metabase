import type { OnBeforeRequestHandler } from "metabase/plugins/oss/api";

import type { EmbeddingSdkPlugin } from "./sdk-plugin.types";

const noopRequestHandler: OnBeforeRequestHandler = async () => {};

/**
 * OSS default implementation of the embedding-SDK plugin.
 *
 * In enterprise builds this whole module is swapped for
 * `metabase-enterprise/embedding-sdk/plugin` (see resolve-aliases.js), so this
 * file is never bundled there. Consumers import the resolved module directly:
 *
 *   import { PLUGIN_EMBEDDING_SDK } from "metabase/embedding/sdk-plugin";
 *
 * `onBeforeRequestHandlers` is a runtime-mutable holder: writers reassign its
 * fields during SDK/guest-embed init and the API middleware reads them.
 */
export const PLUGIN_EMBEDDING_SDK: EmbeddingSdkPlugin = {
  isEnabled: () => false,
  onBeforeRequestHandlers: {
    getOrRefreshSessionHandler: noopRequestHandler,
    getOrRefreshGuestSessionHandler: noopRequestHandler,
    overrideRequestsForGuestEmbeds: noopRequestHandler,
  },
};
