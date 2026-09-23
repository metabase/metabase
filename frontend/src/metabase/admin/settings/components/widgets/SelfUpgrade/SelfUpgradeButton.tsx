import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { SELF_UPGRADE_CACHE_KEY, useStartUpgradeMutation } from "metabase/api";
import { Button } from "metabase/ui";

import { SelfUpgradeConfirmModal } from "./SelfUpgradeConfirmModal";

interface SelfUpgradeButtonProps {
  targetVersion: string;
}

export function SelfUpgradeButton({ targetVersion }: SelfUpgradeButtonProps) {
  const [isConfirmOpened, { open: openConfirm, close: closeConfirm }] =
    useDisclosure(false);
  const [startUpgrade, { isUninitialized }] = useStartUpgradeMutation({
    fixedCacheKey: SELF_UPGRADE_CACHE_KEY,
  });

  const handleConfirm = () => {
    // Fire and forget: the request only settles once the server has finished
    // downloading the jar (or has gone away), and the status panel tracks it.
    startUpgrade();
    closeConfirm();
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
