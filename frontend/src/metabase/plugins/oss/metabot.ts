export type PluginMetabotType = {
  isCloudManaged: boolean;
};

const getDefaultPluginMetabot = (): PluginMetabotType => ({
  isCloudManaged: false,
});

export const PLUGIN_METABOT: PluginMetabotType = getDefaultPluginMetabot();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_METABOT, getDefaultPluginMetabot());
}
