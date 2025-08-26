import { useState } from "react";
import { t } from "ttag";

import { useUserSetting } from "metabase/common/hooks";
import { Button, Icon } from "metabase/ui";

import { ViewChangesModal } from "./ViewChangesModal";

export const ViewChangesButton = () => {
  const [currentBranch] = useUserSetting("git-branch", {
    shouldDebounce: false,
  });
  const [modalOpened, setModalOpened] = useState(false);

  const displayBranch = currentBranch || "main";

  if (displayBranch === "main") {
    return null;
  }

  return (
    <>
      <Button
        variant="default"
        size="sm"
        leftSection={<Icon name="eye" size={14} />}
        onClick={() => setModalOpened(true)}
      >
        {t`View changes`}
      </Button>

      <ViewChangesModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        currentBranch={displayBranch}
      />
    </>
  );
};
