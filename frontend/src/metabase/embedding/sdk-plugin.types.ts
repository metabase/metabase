import type { OnBeforeRequestHandler } from "metabase/plugins/oss/api";

/**
 * Runtime-mutable holder of request handlers. Writers (SDK auth init,
 * guest-embed init, guest-embed request override) reassign individual handlers
 * at runtime; the API middleware reads them on every request. The holder
 * object reference is stable — its fields are intentionally mutable.
 */
export interface EmbeddingSdkRequestHandlers {
  getOrRefreshSessionHandler: OnBeforeRequestHandler;
  getOrRefreshGuestSessionHandler: OnBeforeRequestHandler;
  overrideRequestsForGuestEmbeds: OnBeforeRequestHandler;
}

/**
 * The embedding-SDK plugin contract — the single source of truth for the
 * plugin's shape.
 *
 * Two modules implement it:
 *   - `metabase/embedding/sdk-plugin` (OSS default)
 *   - `metabase-enterprise/embedding-sdk/plugin` (enterprise)
 *
 * The build resolves which one is bundled (see resolve-aliases.js). This plugin
 * spans both axes: `isEnabled` is build-resolved (OSS false; EE gated on the
 * embedding_sdk token feature), while `onBeforeRequestHandlers` is a
 * runtime-mutable holder — the "dynamic" half — shared by every writer and the
 * reader through the one resolved module.
 */
export interface EmbeddingSdkPlugin {
  isEnabled: () => boolean;
  readonly onBeforeRequestHandlers: EmbeddingSdkRequestHandlers;
}
