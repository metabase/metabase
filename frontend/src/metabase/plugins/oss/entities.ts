const getDefaultPluginEntities = () => ({
  entities: {} as Record<string, any>,
});

export const PLUGIN_ENTITIES = getDefaultPluginEntities();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_ENTITIES, getDefaultPluginEntities());
}
