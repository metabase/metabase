import { version as reactVersion } from "react";

export const MINIMUM_SUPPORTED_REACT_MAJOR_VERSION = 18;

export function getHostReactMajorVersion(): number | null {
  const majorVersion = parseInt(reactVersion, 10);

  // Should be very rare: only when the host's `react` module has no usable `version`.
  return Number.isNaN(majorVersion) ? null : majorVersion;
}

// An unknown version is treated as supported: rendering is better than
// blocking on a detection gap.
export function isHostReactVersionSupported(
  minimumSupportedMajorVersion = MINIMUM_SUPPORTED_REACT_MAJOR_VERSION,
): boolean {
  const majorVersion = getHostReactMajorVersion();

  return majorVersion === null || majorVersion >= minimumSupportedMajorVersion;
}
