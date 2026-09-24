import { useSetting } from "metabase/settings";
import { versionToNumericComponents } from "metabase/utils/version";

export function useIsOldDemoVersion() {
  const version = useSetting("version");
  const parts = version?.tag ? versionToNumericComponents(version.tag) : null;
  return parts?.[0] === 0 && parts[1] === 57;
}
