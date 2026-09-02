import type { CustomVizDisplayType } from "metabase-types/api";

const CUSTOM_VIZ_SETTING_KEY_PREFIX = "custom-viz:";

// Plugin settings are stored under `custom-viz:<plugin identifier>:<setting id>`
// so a plugin can never write an internal key.
export function getCustomVizSettingKeyPrefix(
  display: CustomVizDisplayType,
): string {
  const identifier = display.slice("custom:".length);
  return `${CUSTOM_VIZ_SETTING_KEY_PREFIX}${identifier}:`;
}

export function isCustomVizSettingKey(key: string): boolean {
  return key.startsWith(CUSTOM_VIZ_SETTING_KEY_PREFIX);
}
