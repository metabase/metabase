import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  SELF_UPGRADE_CACHE_KEY,
  useGetUpgradeHealthQuery,
  useStartUpgradeMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";

import {
  isUpgradeInProgress,
  readUpgradeSession,
  writeUpgradeSession,
} from "./upgrade-session";
import {
  fetchRestartedVersion,
  getDownloadProgress,
  hasServerRefusedUpgrade,
  isUpgradeComplete,
} from "./utils";

const UPGRADE_TIMEOUT_MS = 15 * 60 * 1000;

export type UpgradeStatusPhase =
  | "updating"
  | "installing"
  | "restarting"
  | "done"
  | "failed";

export function useUpgradeStatus() {
  const [, { isLoading, isSuccess, isError, error, reset }] =
    useStartUpgradeMutation({ fixedCacheKey: SELF_UPGRADE_CACHE_KEY });
  const [session, setSession] = useState(readUpgradeSession);
  const operation = session?.operation ?? "upgrade";
  const isDowngrade = operation === "downgrade";
  const isActive = isUpgradeInProgress(session);
  const { data: upgradeHealth, isError: isHealthError } =
    useGetUpgradeHealthQuery(undefined, {
      skip: !isActive || isDowngrade,
      pollingInterval: 1000,
      refetchOnMountOrArgChange: true,
    });
  const hasUpgradeStarted =
    session?.hasStarted === true ||
    (!isDowngrade &&
      upgradeHealth != null &&
      upgradeHealth.status !== "not-upgrading");

  // An HTTP error means the server refused the upgrade unless the download
  // had already started. A dropped connection is expected during the restart.
  const hasServerRefused =
    isError && hasServerRefusedUpgrade(error, operation, hasUpgradeStarted);

  useEffect(() => {
    if (!session || !isActive) {
      return;
    }
    if (hasServerRefused) {
      const nextSession = {
        ...session,
        errorMessage: getErrorMessage(
          error,
          isDowngrade ? t`Downgrade failed` : t`Update failed`,
        ),
      };
      writeUpgradeSession(nextSession);
      setSession(nextSession);
    } else if (hasUpgradeStarted && !session.hasStarted) {
      const nextSession = { ...session, hasStarted: true };
      writeUpgradeSession(nextSession);
      setSession(nextSession);
    }
  }, [
    session,
    isActive,
    hasServerRefused,
    hasUpgradeStarted,
    error,
    isDowngrade,
  ]);

  useEffect(() => {
    if (!session || !isActive || hasServerRefused) {
      return;
    }
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let isCancelled = false;
    const poll = async () => {
      const version = await fetchRestartedVersion();
      if (isCancelled) {
        return;
      }
      if (isUpgradeComplete(version, session)) {
        const nextSession = { ...session, newVersion: version };
        writeUpgradeSession(nextSession);
        setSession(nextSession);
        return;
      }
      if (Date.now() - session.startedAt >= UPGRADE_TIMEOUT_MS) {
        const nextSession = {
          ...session,
          errorMessage: isDowngrade
            ? t`We couldn't confirm that the downgrade finished. Reload the page to check your version.`
            : t`We couldn't confirm that the update finished. Reload the page to check your version.`,
        };
        writeUpgradeSession(nextSession);
        setSession(nextSession);
        return;
      }
      timeoutId = setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [session, isActive, hasServerRefused, isDowngrade]);

  let phase: UpgradeStatusPhase = "updating";
  if (session?.errorMessage) {
    phase = "failed";
  } else if (session?.newVersion) {
    phase = "done";
  } else if (isDowngrade) {
    phase = isLoading ? "installing" : "restarting";
  } else if (
    isHealthError ||
    isSuccess ||
    isError ||
    (!isLoading && upgradeHealth?.status === "not-upgrading")
  ) {
    phase = "restarting";
  } else if (upgradeHealth?.status === "downloaded") {
    phase = "installing";
  }

  return {
    hasStatus: session != null,
    operation,
    phase,
    downloadProgress: isDowngrade ? null : getDownloadProgress(upgradeHealth),
    newVersion: session?.newVersion,
    errorMessage: session?.errorMessage,
    reset,
  };
}
