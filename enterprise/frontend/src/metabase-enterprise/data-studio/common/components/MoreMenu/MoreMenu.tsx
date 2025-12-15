import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { ActionIcon, Icon, Menu } from "metabase/ui";

type MoreMenuProps = {
  previewUrl?: string;
  onRemove?: () => void;
  ariaLabel: string;
  removeLabel: string;
  removeTitle: string;
  removeMessage: string;
};

export function MoreMenu({
  previewUrl,
  onRemove,
  ariaLabel,
  removeLabel,
  removeTitle,
  removeMessage,
}: MoreMenuProps) {
  const [isConfirmOpen, { open: openConfirm, close: closeConfirm }] =
    useDisclosure();

  const handleConfirm = () => {
    closeConfirm();
    onRemove?.();
  };

  if (!previewUrl && !onRemove) {
    return null;
  }

  return (
    <>
      <Menu>
        <Menu.Target>
          <ActionIcon aria-label={ariaLabel}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {previewUrl && (
            <Menu.Item
              component={Link}
              to={previewUrl}
              target="_blank"
              leftSection={<Icon name="share" />}
            >
              {t`Preview`}
            </Menu.Item>
          )}
          {onRemove && (
            <Menu.Item
              c="danger"
              leftSection={<Icon name="trash" />}
              onClick={openConfirm}
            >
              {removeLabel}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
      <ConfirmModal
        title={removeTitle}
        message={removeMessage}
        opened={isConfirmOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        confirmButtonText={t`Remove`}
      />
    </>
  );
}
