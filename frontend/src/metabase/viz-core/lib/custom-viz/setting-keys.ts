import type { CustomVizDisplayType } from "metabase-types/api";

const CUSTOM_VIZ_DISPLAY_PREFIX = "custom:";

// Plugin settings are stored under `custom:<plugin identifier>:<setting id>`
// so a plugin can never write an internal key.
export function getCustomVizSettingKeyPrefix(
  display: CustomVizDisplayType,
): string {
  return `${display}:`;
}

export function isCustomVizSettingKey(key: string): boolean {
  return (
    key.startsWith(CUSTOM_VIZ_DISPLAY_PREFIX) &&
    key.includes(":", CUSTOM_VIZ_DISPLAY_PREFIX.length)
  );
}
