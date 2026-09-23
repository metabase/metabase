import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { SELF_UPGRADE_CACHE_KEY, useStartUpgradeMutation } from "metabase/api";
import { getErrorStatus } from "metabase/api/client/errors";
import { getErrorMessage } from "metabase/api/utils";
import { useNavigate } from "metabase/router";
import {
  readUpgradeSession,
  writeUpgradeSession,
} from "metabase/status/hooks/self-upgrade/upgrade-session";
import { Button } from "metabase/ui";

import { SelfUpgradeConfirmModal } from "./SelfUpgradeConfirmModal";

interface SelfUpgradeButtonProps {
  targetVersion: string;
}

export function SelfUpgradeButton({ targetVersion }: SelfUpgradeButtonProps) {
  const navigate = useNavigate();
  const [isConfirmOpened, { open: openConfirm, close: closeConfirm }] =
    useDisclosure(false);
  const [startUpgrade, { isUninitialized }] = useStartUpgradeMutation({
    fixedCacheKey: SELF_UPGRADE_CACHE_KEY,
  });

  const handleConfirm = () => {
    writeUpgradeSession({
      targetVersion,
      startedAt: Date.now(),
      hasStarted: false,
    });
    // Fire and forget: the request only settles once the server has finished
    // downloading the jar (or has gone away), and the status page tracks it.
    void startUpgrade().then((result) => {
      const session = readUpgradeSession();
      if (
        session &&
        result.error &&
        getErrorStatus(result.error) != null &&
        !session.hasStarted
      ) {
        writeUpgradeSession({
          ...session,
          errorMessage: getErrorMessage(result.error, t`Update failed`),
        });
      }
    });
    closeConfirm();
    navigate("/update");
  };

  return (
    <>
      <Button
        variant="filled"
        size="sm"
        flex="0 0 auto"
        disabled={!isUninitialized}
        onClick={openConfirm}
      >
        {t`Update now`}
      </Button>
      <SelfUpgradeConfirmModal
        opened={isConfirmOpened}
        targetVersion={targetVersion}
        onConfirm={handleConfirm}
        onClose={closeConfirm}
      />
    </>
  );
}
