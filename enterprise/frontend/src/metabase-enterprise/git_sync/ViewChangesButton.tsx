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
        variant="outline"
        size="sm"
        leftSection={<Icon name="eye" size={14} />}
        onClick={() => setModalOpened(true)}
        styles={{
          root: {
            color: "var(--mb-color-text-white)",
            border: "1px solid var(--mb-color-bg-white-alpha-15)",
            fontSize: "13px",
            fontWeight: 700,
            whiteSpace: "nowrap",
            "&:hover": {
              color: "var(--mb-color-text-white)",
              backgroundColor: "var(--mb-color-bg-black-alpha-60)",
              borderColor: "var(--mb-color-text-white-alpha-85)",
            },
          },
        }}
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
