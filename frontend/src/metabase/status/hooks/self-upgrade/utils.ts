import { compareVersions } from "metabase/utils/version";
import type { Settings, UpgradeHealth } from "metabase-types/api";

/** Fraction of the jar downloaded so far, or `null` while the size is unknown. */
export function getDownloadProgress(upgradeHealth: UpgradeHealth | undefined) {
  if (upgradeHealth?.status !== "upgrading") {
    return null;
  }
  const { current, total } = upgradeHealth;
  if (current == null || total == null || total <= 0) {
    return null;
  }
  return Math.max(0, Math.min(current / total, 1));
}

export function isUpgradedTo(
  version: string | null,
  targetVersion: string | undefined,
): version is string {
  const comparison = compareVersions(version, targetVersion);
  return comparison != null && comparison >= 0;
}

/**
 * Uses plain `fetch` on purpose: the API client retries 503s and emits auth
 * events, neither of which is wanted while the server is coming back up.
 * Resolves with `null` while the server is down, booting, or unauthenticated.
 */
export async function fetchRestartedVersion(): Promise<string | null> {
  try {
    const signal = AbortSignal.timeout(5000);
    const health = await fetch("/api/health", { cache: "no-store", signal });
    if (!health.ok) {
      return null;
    }
    const properties = await fetch("/api/session/properties", {
      cache: "no-store",
      signal,
    });
    if (!properties.ok) {
      return null;
    }
    const { version }: Pick<Settings, "version"> = await properties.json();
    return version?.tag ?? null;
  } catch {
    return null;
  }
}
