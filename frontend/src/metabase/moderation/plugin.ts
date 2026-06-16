/**
 * The resolved moderation plugin — what consumers import:
 *
 *   import { PLUGIN_MODERATION } from "metabase/moderation/plugin";
 *
 * In OSS builds this re-exports the default (no-op) implementation. In
 * enterprise builds the whole module is swapped for
 * `metabase-enterprise/moderation/plugin` (see resolve-aliases.js).
 */
export { PLUGIN_MODERATION } from "./default";
