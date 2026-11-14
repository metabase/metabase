import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { ActionIcon, Box, Icon, Menu } from "metabase/ui";

/** A hierarchy row's overflow menu: edit it, or delete it once confirmed */
export function HierarchyMenu({
  hierarchyName,
  onEdit,
  onDelete,
}: {
  hierarchyName: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { modalContent: confirmationModal, show: showConfirmation } =
    useConfirmation();

  const handleDeleteClick = () =>
    showConfirmation({
      title: t`Delete "${hierarchyName}"?`,
      message: t`Its columns stay; only the hierarchy is deleted.`,
      confirmButtonText: t`Delete`,
      confirmButtonProps: { color: "negative" },
      onConfirm: onDelete,
    });

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            aria-label={t`Hierarchy actions`}
            // The row opens or expands on click; the menu is its own
            onClick={(event) => event.stopPropagation()}
          >
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
          <Menu.Item leftSection={<Icon name="pencil" />} onClick={onEdit}>
            {t`Edit hierarchy`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="trash" />}
            c="feedback-negative"
            onClick={handleDeleteClick}
          >
            {t`Delete hierarchy`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {/* React events bubble out of the portaled modal to the row; stop them */}
      <Box display="contents" onClick={(event) => event.stopPropagation()}>
        {confirmationModal}
      </Box>
    </>
  );
}
