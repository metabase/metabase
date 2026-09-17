import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button } from "metabase/ui";

import type { SwitchAdvancedMode } from "../../types";

import S from "./AdvancedGroupModeButton.module.css";
import { EnableAdvancedModal } from "./EnableAdvancedModal";

type Props = {
  message: string;
  loading: boolean;
  onConfirm: SwitchAdvancedMode;
};

export function AdvancedGroupModeButton({
  message,
  loading,
  onConfirm,
}: Props) {
  const [showEnableModal, { toggle: toggleShowEnableModal }] =
    useDisclosure(false);

  return (
    <>
      <Button
        className={S.button}
        onClick={toggleShowEnableModal}
        variant="default"
        size="compact-sm"
        fz="sm"
      >
        {t`Switch to group-level permissions`}
      </Button>
      {showEnableModal && (
        <EnableAdvancedModal
          message={message}
          loading={loading}
          onConfirm={onConfirm}
          onClose={toggleShowEnableModal}
        />
      )}
    </>
  );
}
