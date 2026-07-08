import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button } from "metabase/ui";

import S from "./AdvancedGroupModeButton.module.css";
import { EnableAdvancedModal } from "./EnableAdvancedModal";

export function AdvancedGroupModeButton() {
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
        <EnableAdvancedModal onClose={toggleShowEnableModal} />
      )}
    </>
  );
}
