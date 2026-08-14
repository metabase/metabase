import { c, t } from "ttag";

import { BulkActionButton } from "metabase/common/components/BulkActionBar";
import { Icon, Menu } from "metabase/ui";

type UnarchivedBulkActionsProps = {
  hasPinned: boolean;
  hasUnpinned: boolean;
  onRequestMove?: () => void;
  onRequestTrash?: () => void;
  onPinAll?: () => void;
  onUnpinAll?: () => void;
  onBookmark?: () => void;
  onDuplicate?: () => void;
  onDeselectAll: () => void;
};

export const UnarchivedBulkActions = ({
  hasPinned,
  hasUnpinned,
  onRequestMove,
  onRequestTrash,
  onPinAll,
  onUnpinAll,
  onBookmark,
  onDuplicate,
  onDeselectAll,
}: UnarchivedBulkActionsProps) => {
  const isPinnedOnly = hasPinned && !hasUnpinned;
  const isMixed = hasPinned && hasUnpinned;

  return (
    <>
      {isPinnedOnly ? (
        <BulkActionButton
          disabled={onUnpinAll == null}
          onClick={onUnpinAll}
        >{t`Unpin all`}</BulkActionButton>
      ) : (
        <BulkActionButton
          disabled={onRequestMove == null}
          onClick={onRequestMove}
        >{t`Move`}</BulkActionButton>
      )}
      <Menu position="top-end">
        <Menu.Target>
          <BulkActionButton aria-label={t`More actions`} px="sm">
            <Icon name="ellipsis" />
          </BulkActionButton>
        </Menu.Target>
        <Menu.Dropdown data-testid="bulk-actions-menu">
          {isPinnedOnly && (
            <Menu.Item
              leftSection={<Icon name="move" aria-hidden />}
              disabled={onRequestMove == null}
              onClick={onRequestMove}
            >
              {t`Move`}
            </Menu.Item>
          )}
          {hasUnpinned && (
            <Menu.Item
              leftSection={<Icon name="pin" aria-hidden />}
              disabled={onPinAll == null}
              onClick={onPinAll}
            >
              {t`Pin all`}
            </Menu.Item>
          )}
          {isMixed && (
            <Menu.Item
              leftSection={<Icon name="unpin" aria-hidden />}
              disabled={onUnpinAll == null}
              onClick={onUnpinAll}
            >
              {t`Unpin all`}
            </Menu.Item>
          )}
          <Menu.Item
            leftSection={<Icon name="bookmark" aria-hidden />}
            disabled={onBookmark == null}
            onClick={onBookmark}
          >
            {c("Verb").t`Bookmark`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="clone" aria-hidden />}
            disabled={onDuplicate == null}
            onClick={onDuplicate}
          >
            {c("Verb").t`Duplicate`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="close" aria-hidden />}
            onClick={onDeselectAll}
          >
            {t`Deselect all`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="trash" aria-hidden />}
            disabled={onRequestTrash == null}
            onClick={onRequestTrash}
          >
            {t`Move to trash`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
};
