import type { MouseEvent } from "react";
import { t } from "ttag";

import { useUpdateCollectionMutation } from "metabase/api";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Menu } from "metabase/ui";

type CollectionRowMenuProps = {
  collectionId: number;
  collectionName: string;
};

export function CollectionRowMenu({
  collectionId,
  collectionName,
}: CollectionRowMenuProps) {
  const [updateCollection] = useUpdateCollectionMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const { show, modalContent } = useConfirmation();

  const handleClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleArchive = async () => {
    try {
      await updateCollection({ id: collectionId, archived: true }).unwrap();
      sendSuccessToast(t`Collection archived`);
    } catch {
      sendErrorToast(t`Failed to archive collection`);
    }
  };

  const handleArchiveClick = () => {
    show({
      title: t`Archive "${collectionName}"?`,
      message: t`Are you sure you want to archive this collection?`,
      confirmButtonText: t`Archive`,
      onConfirm: handleArchive,
    });
  };

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon
            size="sm"
            onClick={handleClick}
            aria-label={t`Collection menu`}
          >
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="archive" />}
            onClick={handleArchiveClick}
          >
            {t`Archive`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {modalContent}
    </>
  );
}
