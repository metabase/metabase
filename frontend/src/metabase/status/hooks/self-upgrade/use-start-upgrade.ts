import { t } from "ttag";

import { SELF_UPGRADE_CACHE_KEY, useStartUpgradeMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useNavigate } from "metabase/router";

import {
  type UpgradeVersions,
  isUpgradeInProgress,
  readUpgradeSession,
  writeUpgradeSession,
} from "./upgrade-session";
import { hasServerRefusedUpgrade } from "./utils";

export function useStartUpgrade() {
  const navigate = useNavigate();
  const [startUpgrade, { isUninitialized }] = useStartUpgradeMutation({
    fixedCacheKey: SELF_UPGRADE_CACHE_KEY,
  });

  const start = (versions: UpgradeVersions) => {
    if (isUpgradeInProgress(readUpgradeSession())) {
      navigate("/update");
      return;
    }
    const startedAt = Date.now();
    writeUpgradeSession({
      ...versions,
      startedAt,
      hasStarted: versions.operation === "downgrade",
    });
    // Fire and forget: the request only settles once the server has finished
    // downloading the jar (or has gone away), and the status page tracks it.
    void startUpgrade(versions.operation).then((result) => {
      const session = readUpgradeSession();
      if (
        session?.startedAt === startedAt &&
        !session.newVersion &&
        result.error &&
        hasServerRefusedUpgrade(
          result.error,
          session.operation,
          session.hasStarted,
        )
      ) {
        const fallback =
          session.operation === "downgrade"
            ? t`Downgrade failed`
            : t`Update failed`;
        writeUpgradeSession({
          ...session,
          errorMessage: getErrorMessage(result.error, fallback),
        });
      }
    });
    navigate("/update");
  };

  return {
    start,
    isDisabled: !isUninitialized || isUpgradeInProgress(readUpgradeSession()),
  };
}
