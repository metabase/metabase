const getDefaultPluginEntities = () => ({
  entities: {} as Record<string, any>,
});

export const PLUGIN_ENTITIES = getDefaultPluginEntities();

export function reinitialize() {
  Object.assign(PLUGIN_ENTITIES, getDefaultPluginEntities());
}
