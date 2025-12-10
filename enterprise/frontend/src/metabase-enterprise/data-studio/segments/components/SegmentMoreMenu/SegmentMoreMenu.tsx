import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { ActionIcon, Icon, Menu } from "metabase/ui";

type SegmentMoreMenuProps = {
  previewUrl?: string;
  onRemove?: () => void;
};

export function SegmentMoreMenu({
  previewUrl,
  onRemove,
}: SegmentMoreMenuProps) {
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
          <ActionIcon aria-label={t`Segment actions`}>
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
              {t`Remove segment`}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
      <ConfirmModal
        title={t`Remove this segment?`}
        message={t`This segment will be permanently removed.`}
        opened={isConfirmOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        confirmButtonText={t`Remove`}
      />
    </>
  );
}
