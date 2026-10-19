import { useState } from "react";
import { c, t } from "ttag";

import {
  useCreateBookmarkMutation,
  useDeleteBookmarkMutation,
  useListBookmarksQuery,
} from "metabase/api";
import { MoreMenuButton } from "metabase/common/data-studio/components/MoreMenuButton";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Icon, Menu } from "metabase/ui";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { Dashboard } from "metabase-types/api";

import { useCanEditDashboard } from "../../../hooks/use-can-edit-dashboard";

import { DashboardModal, type DashboardModalType } from "./DashboardModal";

type DashboardMoreMenuProps = {
  dashboard: Dashboard;
};

export function DashboardMoreMenu({ dashboard }: DashboardMoreMenuProps) {
  const [modalType, setModalType] = useState<DashboardModalType>();

  if (dashboard.archived) {
    return null;
  }

  return (
    <>
      <DashboardMenu dashboard={dashboard} onOpenModal={setModalType} />
      {modalType != null && (
        <DashboardModal
          dashboard={dashboard}
          modalType={modalType}
          onClose={() => setModalType(undefined)}
        />
      )}
    </>
  );
}

type DashboardMenuProps = {
  dashboard: Dashboard;
  onOpenModal: (modalType: DashboardModalType) => void;
};

function DashboardMenu({ dashboard, onOpenModal }: DashboardMenuProps) {
  const canEdit = useCanEditDashboard(dashboard);
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

  return (
    <Menu>
      <Menu.Target>
        <MoreMenuButton aria-label={t`More options`} />
      </Menu.Target>
      <Menu.Dropdown>
        <BookmarkMenuItem dashboard={dashboard} />
        {dashboard.can_write && <ModerationMenuItems dashboard={dashboard} />}
        {canEdit && (
          <Menu.Item
            leftSection={<Icon name="move" />}
            onClick={() => onOpenModal("move")}
          >
            {c("A verb, not a noun").t`Move`}
          </Menu.Item>
        )}
        {!isRemoteSyncReadOnly && (
          <Menu.Item
            leftSection={<Icon name="clone" />}
            onClick={() => onOpenModal("duplicate")}
          >
            {c("A verb, not a noun").t`Duplicate`}
          </Menu.Item>
        )}
        {canEdit && (
          <>
            <Menu.Divider role="separator" />
            <Menu.Item
              leftSection={<Icon name="trash" />}
              onClick={() => onOpenModal("trash")}
            >
              {t`Move to trash`}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

type DashboardMenuItemProps = {
  dashboard: Dashboard;
};

function BookmarkMenuItem({ dashboard }: DashboardMenuItemProps) {
  const { data: bookmarks = [] } = useListBookmarksQuery();
  const [createBookmark] = useCreateBookmarkMutation();
  const [deleteBookmark] = useDeleteBookmarkMutation();
  const isBookmarked = bookmarks.some(
    (bookmark) =>
      bookmark.type === "dashboard" && bookmark.item_id === dashboard.id,
  );

  return (
    <Menu.Item
      leftSection={
        <Icon name={isBookmarked ? "bookmark_filled" : "bookmark"} />
      }
      onClick={() =>
        isBookmarked
          ? deleteBookmark({ id: dashboard.id, type: "dashboard" })
          : createBookmark({ id: dashboard.id, type: "dashboard" })
      }
    >
      {isBookmarked ? t`Remove from bookmarks` : t`Bookmark`}
    </Menu.Item>
  );
}

function ModerationMenuItems({ dashboard }: DashboardMenuItemProps) {
  return <>{PLUGIN_MODERATION.useDashboardMenuItems(dashboard)}</>;
}
