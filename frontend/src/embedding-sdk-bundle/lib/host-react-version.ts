import { getHostReactVersion } from "embedding-sdk-bundle/analytics/snowplow";

export function getHostReactMajorVersion(): number | null {
  const majorVersion = parseInt(getHostReactVersion(), 10);

  return Number.isNaN(majorVersion) ? null : majorVersion;
}
