import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import type { CollectionTreeItem } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/MainNavbarView";
import { ActionIcon, Icon } from "metabase/ui";

import { PushChangesModal } from "../PushChangesModal";

interface PushChangesButtonProps {
  currentBranch: string;
  syncedCollections: CollectionTreeItem[];
}

export const PushChangesButton = (props: PushChangesButtonProps) => {
  const { syncedCollections, currentBranch } = props;
  const [showPush, { open: openPush, close: closePush }] = useDisclosure(false);

  return (
    <>
      <ActionIcon
        aria-label={t`Push to Git`}
        c="icon-secondary"
        h={24}
        onClick={openPush}
        px={0}
        variant="subtle"
      >
        <Icon name="arrow_up" size={16} tooltip={t`Push to Git`} />
      </ActionIcon>
      {showPush && (
        <PushChangesModal
          onClose={closePush}
          collections={syncedCollections}
          currentBranch={currentBranch!}
        />
      )}
    </>
  );
};
