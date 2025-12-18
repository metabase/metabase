import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useUpdateCollectionMutation } from "metabase/api";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { ActionIcon, Box, Icon, Menu } from "metabase/ui";
import { EditTransformCollectionModal } from "metabase-enterprise/transforms/components/EditTransformCollectionModal";

type CollectionRowMenuProps = {
  collectionId: number;
  collectionName: string;
  transformCount: number;
};

export function CollectionRowMenu({
  collectionId,
  collectionName,
  transformCount,
}: CollectionRowMenuProps) {
  const dispatch = useDispatch();
  const [updateCollection] = useUpdateCollectionMutation();
  const { show, modalContent } = useConfirmation();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const handleArchive = async () => {
    try {
      await updateCollection({ id: collectionId, archived: true }).unwrap();
      dispatch(
        addUndo({
          message: t`Collection archived`,
          action: async () => {
            await updateCollection({ id: collectionId, archived: false });
          },
        }),
      );
    } catch {
      dispatch(
        addUndo({
          message: t`Failed to archive collection`,
          icon: "warning",
        }),
      );
    }
  };

  const handleArchiveClick = () => {
    const message =
      transformCount > 0
        ? ngettext(
            msgid`This will also archive ${transformCount} transform inside it.`,
            `This will also archive ${transformCount} transforms inside it.`,
            transformCount,
          )
        : t`Are you sure you want to archive this collection?`;

    show({
      title: t`Archive "${collectionName}"?`,
      message,
      confirmButtonText: t`Archive`,
      onConfirm: handleArchive,
    });
  };

  return (
    <Box onClick={(e) => e.stopPropagation()}>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon size="sm" aria-label={t`Collection menu`}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="pencil" />}
            onClick={() => setIsEditModalOpen(true)}
          >
            {t`Edit collection details`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="archive" />}
            onClick={handleArchiveClick}
          >
            {t`Archive`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {modalContent}
      {isEditModalOpen && (
        <EditTransformCollectionModal
          collectionId={collectionId}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}
    </Box>
  );
}
