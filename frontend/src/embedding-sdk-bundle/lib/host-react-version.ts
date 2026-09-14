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

export function getUnsupportedReactVersionMessage(): string {
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- only shown on an unsupported host React version
  return `The Metabase modular embedding SDK requires React ${MINIMUM_SUPPORTED_REACT_MAJOR_VERSION} or newer, but this application is running React ${getHostReactMajorVersion()}. Upgrade your application to React ${MINIMUM_SUPPORTED_REACT_MAJOR_VERSION} to display embedded content.`;
}

let hasLoggedUnsupportedReactVersion = false;

// Every unsupported React check calls this, so the console gets one message
// per page even when nothing renders the error component.
export function logUnsupportedReactVersionOnce() {
  if (hasLoggedUnsupportedReactVersion) {
    return;
  }

  console.error(getUnsupportedReactVersionMessage());
  hasLoggedUnsupportedReactVersion = true;
}
