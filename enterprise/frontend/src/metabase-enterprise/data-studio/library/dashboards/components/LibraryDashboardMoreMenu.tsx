import { useDisclosure } from "@mantine/hooks";
import { dissoc } from "icepick";
import { c, t } from "ttag";

import {
  useCopyDashboardMutation,
  useUpdateDashboardMutation,
} from "metabase/api";
import { CopyModal } from "metabase/common/components/CopyModal";
import { MoveModal } from "metabase/common/components/Pickers/MoveModal/MoveModal";
import { useConfirmation, useSetCollection } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useNavigate } from "metabase/router";
import { Button, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

type LibraryDashboardMoreMenuProps = {
  dashboard: Dashboard;
};

/** Move, Duplicate, and Move to trash, which the main app hides for Library dashboards. */
export function LibraryDashboardMoreMenu({
  dashboard,
}: LibraryDashboardMoreMenuProps) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const setCollection = useSetCollection();
  const [updateDashboard] = useUpdateDashboardMutation();
  const [copyDashboard] = useCopyDashboardMutation();
  const [isMoveModalOpen, { open: openMoveModal, close: closeMoveModal }] =
    useDisclosure(false);
  const [isCopyModalOpen, { open: openCopyModal, close: closeCopyModal }] =
    useDisclosure(false);
  const { show: showConfirmation, modalContent: confirmationModal } =
    useConfirmation();

  const handleMoveToTrash = () =>
    showConfirmation({
      title: t`Move "${dashboard.name}" to trash?`,
      message: t`This dashboard and any questions saved in it will be moved to the trash.`,
      confirmButtonText: t`Move to trash`,
      onConfirm: async () => {
        await updateDashboard({ id: dashboard.id, archived: true }).unwrap();
        navigate(Urls.dataStudioLibraryDashboards());
        dispatch(
          addUndo({
            message: t`"${dashboard.name}" has been moved to the trash.`,
            action: () =>
              updateDashboard({ id: dashboard.id, archived: false }),
          }),
        );
      },
    });

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button aria-label={t`Dashboard options`} px="sm">
            <Icon name="ellipsis" />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {dashboard.can_write && (
            <Menu.Item
              leftSection={<Icon name="move" />}
              onClick={openMoveModal}
            >
              {c("A verb, not a noun").t`Move`}
            </Menu.Item>
          )}
          <Menu.Item
            leftSection={<Icon name="clone" />}
            onClick={openCopyModal}
          >
            {c("A verb, not a noun").t`Duplicate`}
          </Menu.Item>
          {dashboard.can_write && (
            <>
              <Menu.Divider />
              <Menu.Item
                leftSection={<Icon name="trash" />}
                c="feedback-negative"
                onClick={handleMoveToTrash}
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
          title={t`Move dashboard to…`}
          onClose={closeMoveModal}
          canMoveToDashboard={false}
          movingItem={{
            ...dashboard,
            model: "dashboard",
            collection: {
              id: dashboard.collection?.id ?? "root",
              name: dashboard.collection?.name ?? "",
              namespace: dashboard.collection?.namespace,
            },
          }}
          onMove={async (destination) => {
            await setCollection(
              { model: "dashboard", id: dashboard.id },
              destination,
            );
            closeMoveModal();
          }}
        />
      )}
      {isCopyModalOpen && (
        <CopyModal
          entityType="dashboards"
          entityObject={dashboard}
          title={t`Duplicate "${dashboard.name}"`}
          overwriteOnInitialValuesChange
          copy={async (values) => {
            const { is_shallow_copy, ...overrides } = dissoc(values, "id");
            return await copyDashboard({
              id: dashboard.id,
              ...overrides,
              is_deep_copy: !is_shallow_copy,
            }).unwrap();
          }}
          onClose={closeCopyModal}
          onSaved={(copy: Dashboard) =>
            navigate(Urls.dataStudioLibraryDashboard(copy.id))
          }
        />
      )}
    </>
  );
}
