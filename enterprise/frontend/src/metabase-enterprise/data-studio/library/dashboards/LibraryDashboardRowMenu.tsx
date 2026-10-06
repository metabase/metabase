import { useDisclosure } from "@mantine/hooks";
import type { MouseEvent } from "react";
import { t } from "ttag";

import { useUpdateDashboardMutation } from "metabase/api";
import { MoveModal } from "metabase/common/components/Pickers/MoveModal/MoveModal";
import { useConfirmation, useSetCollection } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useLocation, useNavigate } from "metabase/router";
import { ActionIcon, Box, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Collection } from "metabase-types/api";

import type { DashboardTreeNode, LibraryDashboard } from "./utils";

type LibraryDashboardRowMenuProps = {
  node: DashboardTreeNode;
  parentCollection: Pick<Collection, "id" | "name" | "can_write">;
};

export function LibraryDashboardRowMenu({
  node,
  parentCollection,
}: LibraryDashboardRowMenuProps) {
  const [isMoveModalOpen, { open: openMoveModal, close: closeMoveModal }] =
    useDisclosure(false);
  const setCollection = useSetCollection();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [updateDashboard] = useUpdateDashboardMutation();
  const { show: showConfirmation, modalContent: confirmationModal } =
    useConfirmation();

  const canWrite =
    node.model === "dashboard"
      ? parentCollection.can_write
      : node.collection.can_write;

  if (!canWrite) {
    return null;
  }

  const label =
    node.model === "dashboard" ? t`Dashboard options` : t`Folder options`;

  // Saving or canceling in the dashboard editor brings the user back here
  const handleEdit = (dashboard: LibraryDashboard) =>
    navigate(Urls.dashboard(dashboard, { editMode: true }), {
      state: { returnTo: pathname },
    });

  const handleMoveToTrash = (dashboard: LibraryDashboard) =>
    showConfirmation({
      title: t`Move "${dashboard.name}" to trash?`,
      message: t`This dashboard and any questions saved in it will be moved to the trash.`,
      confirmButtonText: t`Move to trash`,
      onConfirm: async () => {
        await updateDashboard({ id: dashboard.id, archived: true }).unwrap();
        dispatch(
          addUndo({
            message: t`"${dashboard.name}" has been moved to the trash.`,
            action: () =>
              updateDashboard({ id: dashboard.id, archived: false }),
          }),
        );
      },
    });

  // The whole row is a link. Keep clicks on the menu, its portaled dropdown,
  // and the move modal from reaching the row's click handler, and keep clicks
  // on the menu button itself from following the link's href.
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (
      event.target instanceof Node &&
      event.currentTarget.contains(event.target)
    ) {
      event.preventDefault();
    }
  };

  return (
    <Box onClick={handleClick}>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon aria-label={label} size="md">
            <FixedSizeIcon name="ellipsis" size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {node.model === "dashboard" && (
            <Menu.Item
              leftSection={<Icon name="pencil" />}
              onClick={() => handleEdit(node.dashboard)}
            >
              {t`Edit`}
            </Menu.Item>
          )}
          <Menu.Item leftSection={<Icon name="move" />} onClick={openMoveModal}>
            {t`Move`}
          </Menu.Item>
          {node.model === "dashboard" && (
            <>
              <Menu.Divider />
              <Menu.Item
                leftSection={<Icon name="trash" />}
                c="feedback-negative"
                onClick={() => handleMoveToTrash(node.dashboard)}
              >
                {t`Move to trash`}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
      {confirmationModal}
      {isMoveModalOpen && (
        <MoveModal
          title={
            node.model === "dashboard"
              ? t`Move dashboard to…`
              : t`Move folder to…`
          }
          onClose={closeMoveModal}
          canMoveToDashboard={false}
          movingItem={{
            id:
              node.model === "dashboard"
                ? node.dashboard.id
                : node.collection.id,
            name: node.name,
            model: node.model,
            can_write: true,
            location:
              node.model === "collection"
                ? node.collection.location
                : undefined,
            collection: {
              id: parentCollection.id,
              name: parentCollection.name,
            },
          }}
          onMove={async (destination) => {
            await setCollection(
              node.model === "dashboard"
                ? { model: "dashboard", id: node.dashboard.id }
                : { model: "collection", id: node.collection.id },
              destination,
            );
            closeMoveModal();
          }}
        />
      )}
    </Box>
  );
}
