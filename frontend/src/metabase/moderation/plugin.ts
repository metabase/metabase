/**
 * The resolved moderation plugin — what consumers import:
 *
 *   import { PLUGIN_MODERATION } from "metabase/moderation/plugin";
 *
 * In OSS builds this is the contract's no-op value. In enterprise builds the
 * whole module is swapped for `metabase-enterprise/moderation/plugin` (see
 * resolve-aliases.js).
 */
export { PLUGIN_MODERATION_NOOP as PLUGIN_MODERATION } from "./types";
