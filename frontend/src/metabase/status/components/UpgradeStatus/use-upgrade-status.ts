import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  SELF_UPGRADE_CACHE_KEY,
  useGetUpgradeHealthQuery,
  useStartUpgradeMutation,
} from "metabase/api";
import { getErrorStatus } from "metabase/api/client/errors";
import { getErrorMessage } from "metabase/api/utils";
import { compareVersions } from "metabase/utils/version";
import type { Settings, UpgradeHealth } from "metabase-types/api";

const UPGRADE_HEALTH_POLL_INTERVAL_MS = 1000;
const HEALTH_POLL_INTERVAL_MS = 2000;

export type UpgradeStatusPhase =
  | "updating"
  | "installing"
  | "restarting"
  | "done"
  | "failed";

export function useUpgradeStatus(targetVersion: string | undefined) {
  const [, { isUninitialized, isLoading, isSuccess, isError, error, reset }] =
    useStartUpgradeMutation({ fixedCacheKey: SELF_UPGRADE_CACHE_KEY });
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const { data: upgradeHealth } = useGetUpgradeHealthQuery(undefined, {
    skip: !isLoading,
    pollingInterval: UPGRADE_HEALTH_POLL_INTERVAL_MS,
  });
  const hasUpgradeStarted =
    upgradeHealth != null && upgradeHealth.status !== "not-upgrading";

  // An HTTP error means the server is still up and refused the upgrade,
  // unless the download had already started: then the response is just the
  // last thing the old process sent before exiting. A dropped connection
  // means it exited to restart, same as a 2xx.
  const hasServerRefused =
    isError && getErrorStatus(error) != null && !hasUpgradeStarted;
  const isRestarting =
    (isSuccess || isError) && !hasServerRefused && newVersion == null;

  useEffect(() => {
    if (!isRestarting) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let isCancelled = false;

    const poll = async () => {
      const version = await fetchRestartedVersion();
      if (isCancelled) {
        return;
      }
      if (isUpgradedTo(version, targetVersion)) {
        setNewVersion(version);
        return;
      }
      timeoutId = setTimeout(poll, HEALTH_POLL_INTERVAL_MS);
    };

    poll();

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [isRestarting, targetVersion]);

  const handleReset = () => {
    setNewVersion(null);
    reset();
  };

  return {
    hasStatus: !isUninitialized,
    phase: getPhase({
      hasServerRefused,
      isRestarting,
      newVersion,
      upgradeHealth,
    }),
    downloadProgress: getDownloadProgress(upgradeHealth),
    newVersion,
    errorMessage: hasServerRefused
      ? getErrorMessage(error, t`Update failed`)
      : undefined,
    reset: handleReset,
  };
}

function getPhase({
  hasServerRefused,
  isRestarting,
  newVersion,
  upgradeHealth,
}: {
  hasServerRefused: boolean;
  isRestarting: boolean;
  newVersion: string | null;
  upgradeHealth: UpgradeHealth | undefined;
}): UpgradeStatusPhase {
  if (hasServerRefused) {
    return "failed";
  }
  if (newVersion != null) {
    return "done";
  }
  if (isRestarting) {
    return "restarting";
  }
  if (upgradeHealth?.status === "downloaded") {
    return "installing";
  }
  return "updating";
}

/** Fraction of the jar downloaded so far, or `null` while the size is unknown. */
function getDownloadProgress(upgradeHealth: UpgradeHealth | undefined) {
  if (upgradeHealth?.status !== "upgrading") {
    return null;
  }
  const { current, total } = upgradeHealth;
  if (current == null || total == null || total <= 0) {
    return null;
  }
  return Math.min(current / total, 1);
}

function isUpgradedTo(
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
async function fetchRestartedVersion(): Promise<string | null> {
  try {
    const health = await fetch("/api/health", { cache: "no-store" });
    if (!health.ok) {
      return null;
    }
    const properties = await fetch("/api/session/properties", {
      cache: "no-store",
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
