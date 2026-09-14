import { version as reactVersion } from "react";

export function getHostReactMajorVersion(): number | null {
  const majorVersion = parseInt(reactVersion, 10);

  // Should be very rare: only when the host's `react` module has no usable `version`.
  return Number.isNaN(majorVersion) ? null : majorVersion;
}
