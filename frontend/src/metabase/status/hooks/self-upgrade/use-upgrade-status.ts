import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  SELF_UPGRADE_CACHE_KEY,
  useGetUpgradeHealthQuery,
  useStartUpgradeMutation,
} from "metabase/api";
import { getErrorStatus } from "metabase/api/client/errors";
import { getErrorMessage } from "metabase/api/utils";

import { readUpgradeSession, writeUpgradeSession } from "./upgrade-session";
import {
  fetchRestartedVersion,
  getDownloadProgress,
  isUpgradedTo,
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
  const isActive =
    session != null && !session.newVersion && !session.errorMessage;
  const { data: upgradeHealth, isError: isHealthError } =
    useGetUpgradeHealthQuery(undefined, {
      skip: !isActive,
      pollingInterval: 1000,
      refetchOnMountOrArgChange: true,
    });
  const hasUpgradeStarted =
    session?.hasStarted ||
    (upgradeHealth != null && upgradeHealth.status !== "not-upgrading");

  // An HTTP error means the server refused the upgrade unless the download
  // had already started. A dropped connection is expected during the restart.
  const hasServerRefused =
    isError && getErrorStatus(error) != null && !hasUpgradeStarted;

  useEffect(() => {
    if (!session || !isActive) {
      return;
    }
    if (hasServerRefused) {
      const nextSession = {
        ...session,
        errorMessage: getErrorMessage(error, t`Update failed`),
      };
      writeUpgradeSession(nextSession);
      setSession(nextSession);
    } else if (hasUpgradeStarted && !session.hasStarted) {
      const nextSession = { ...session, hasStarted: true };
      writeUpgradeSession(nextSession);
      setSession(nextSession);
    }
  }, [session, isActive, hasServerRefused, hasUpgradeStarted, error]);

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
      if (isUpgradedTo(version, session.targetVersion)) {
        const nextSession = { ...session, newVersion: version };
        writeUpgradeSession(nextSession);
        setSession(nextSession);
        return;
      }
      if (Date.now() - session.startedAt >= UPGRADE_TIMEOUT_MS) {
        const nextSession = {
          ...session,
          errorMessage: t`We couldn't confirm that the update finished. Reload the page to check your version.`,
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
  }, [session, isActive, hasServerRefused]);

  let phase: UpgradeStatusPhase = "updating";
  if (session?.errorMessage) {
    phase = "failed";
  } else if (session?.newVersion) {
    phase = "done";
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
    phase,
    downloadProgress: getDownloadProgress(upgradeHealth),
    newVersion: session?.newVersion,
    errorMessage: session?.errorMessage,
    reset,
  };
}
