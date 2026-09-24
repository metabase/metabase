import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useStartUpgrade } from "metabase/status/hooks/self-upgrade";
import { Button } from "metabase/ui";

import { SelfUpgradeConfirmModal } from "./SelfUpgradeConfirmModal";

interface SelfUpgradeButtonProps {
  targetVersion: string;
}

export function SelfUpgradeButton({ targetVersion }: SelfUpgradeButtonProps) {
  const [isConfirmOpened, { open: openConfirm, close: closeConfirm }] =
    useDisclosure(false);
  const { start, isDisabled } = useStartUpgrade();

  const handleConfirm = () => {
    closeConfirm();
    start({ operation: "upgrade", targetVersion });
  };

  return (
    <>
      <Button
        variant="filled"
        size="sm"
        flex="0 0 auto"
        disabled={isDisabled}
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
